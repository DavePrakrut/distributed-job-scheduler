import cron, { ScheduledTask } from 'node-cron';
import cronParser from 'cron-parser';
import prisma from '../config/db';
import { JobStatus } from '@prisma/client';

export class SchedulerService {
  private isRunning: boolean = false;
  private sweepTask: ScheduledTask | null = null;

  /**
   * Starts the Scheduler Service
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('⏰ Scheduler Service starting...');

    // 1. Execute recovery on boot (handles missed schedules)
    await this.recoverMissedSchedules();

    // 2. Schedule database sweeps every 5 seconds using node-cron
    this.sweepTask = cron.schedule('*/5 * * * * *', async () => {
      try {
        await this.sweep();
      } catch (err) {
        console.error('❌ Scheduler sweep execution error:', err);
      }
    });

    console.log('⏰ Scheduler Service running. Active sweep task: Every 5s.');

    // 3. Register Process Signal Listeners for Graceful Shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Recovers any missed cron schedules while the service was offline (Coalesced catch-up)
   */
  private async recoverMissedSchedules(): Promise<void> {
    try {
      console.log('🔍 Checking for missed cron schedules...');
      const now = new Date();

      // Find active schedules that are overdue
      const missedSchedules = await prisma.scheduledJobs.findMany({
        where: {
          isActive: true,
          isDeleted: false,
          nextRunAt: { lte: now },
        },
      });

      if (missedSchedules.length === 0) {
        console.log('✅ No missed schedules detected.');
        return;
      }

      console.log(`⚠️ Detected ${missedSchedules.length} missed schedules. Recovering...`);

      for (const schedule of missedSchedules) {
        await prisma.$transaction(async (tx) => {
          // 1. Recalculate next trigger relative to the current time (resets timeline)
          const payloadObj = schedule.payload as Record<string, unknown> | null;
          const timezone = typeof payloadObj?.timezone === 'string' ? payloadObj.timezone : 'UTC';

          const interval = cronParser.parseExpression(schedule.cronExpression, {
            currentDate: now,
            tz: timezone,
          });
          const nextRunAt = interval.next().toDate();

          // 2. Optimistic lock update first to prevent race condition triggers
          const updated = await tx.scheduledJobs.updateMany({
            where: {
              id: schedule.id,
              nextRunAt: schedule.nextRunAt,
              isActive: true,
              isDeleted: false,
            },
            data: {
              lastRunAt: now,
              nextRunAt,
            },
          });

          if (updated.count === 0) {
            // Already triggered by another concurrent scheduler instance
            return;
          }

          // 3. Spawn a single catch-up job (coalesced)
          await tx.jobs.create({
            data: {
              name: schedule.name,
              queueId: schedule.queueId,
              projectId: schedule.projectId,
              payload: schedule.payload || {},
              status: JobStatus.QUEUED,
              runAt: now,
            },
          });

          console.log(
            `recovered schedule: "${schedule.name}" -> Next run: ${nextRunAt.toISOString()}`,
          );
        });
      }
    } catch (err) {
      console.error('❌ Failed to recover missed schedules:', err);
    }
  }

  /**
   * Sweeps database to promote delayed jobs and spawn recurring cron tasks
   */
  private async sweep(): Promise<void> {
    const now = new Date();

    // -- PART 1: Promote ready delayed jobs from SCHEDULED to QUEUED status --
    const promotedCount = await prisma.jobs.updateMany({
      where: {
        status: JobStatus.SCHEDULED,
        runAt: { lte: now },
        isDeleted: false,
      },
      data: {
        status: JobStatus.QUEUED,
        updatedAt: now,
      },
    });

    if (promotedCount.count > 0) {
      console.log(`🚀 Promoted ${promotedCount.count} ready delayed jobs to QUEUED.`);
    }

    // -- PART 2: Trigger recurring schedules whose next execution time is reached --
    const overdueSchedules = await prisma.scheduledJobs.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        nextRunAt: { lte: now },
      },
    });

    for (const schedule of overdueSchedules) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Calculate next target execution timestamp
          const payloadObj = schedule.payload as Record<string, unknown> | null;
          const timezone = typeof payloadObj?.timezone === 'string' ? payloadObj.timezone : 'UTC';

          const interval = cronParser.parseExpression(schedule.cronExpression, {
            currentDate: schedule.nextRunAt,
            tz: timezone,
          });
          const nextRunAt = interval.next().toDate();

          // 2. Optimistic lock update first to prevent race condition triggers
          const updated = await tx.scheduledJobs.updateMany({
            where: {
              id: schedule.id,
              nextRunAt: schedule.nextRunAt,
              isActive: true,
              isDeleted: false,
            },
            data: {
              lastRunAt: schedule.nextRunAt,
              nextRunAt,
            },
          });

          if (updated.count === 0) {
            // Already triggered by another concurrent scheduler instance
            return;
          }

          // 3. Create the executable Job instance
          await tx.jobs.create({
            data: {
              name: schedule.name,
              queueId: schedule.queueId,
              projectId: schedule.projectId,
              payload: schedule.payload || {},
              status: JobStatus.QUEUED,
              runAt: schedule.nextRunAt,
            },
          });

          console.log(
            `⏰ Triggered recurring job "${schedule.name}" -> Next scheduled run: ${nextRunAt.toISOString()}`,
          );
        });
      } catch (err) {
        console.error(`❌ Failed to trigger schedule ${schedule.id} ("${schedule.name}"):`, err);
      }
    }
  }

  /**
   * Stops the Scheduler Service
   */
  public async shutdown(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    console.log('🛑 Gracefully shutting down Scheduler Service...');

    if (this.sweepTask) {
      this.sweepTask.stop();
      console.log('⏰ Scheduler sweep intervals stopped.');
    }

    await prisma.$disconnect();
    console.log('🔌 Database connection closed. Scheduler stopped.');
    process.exit(0);
  }
}
