import os from 'os';
import prisma from '../config/db';
import { JobStatus, WorkerStatus, Jobs, Prisma } from '@prisma/client';
import { RetryService } from '../services/retry.service';

export interface TaskHandler {
  (
    payload: unknown,
    log: (message: string, level?: 'INFO' | 'WARN' | 'ERROR') => Promise<void>,
  ): Promise<void>;
}

export class WorkerService {
  private workerId: string;
  private name: string;
  private hostName: string;
  private concurrencyLimit: number;
  private activeJobsCount: number = 0;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private activeTasks: Map<
    string,
    { abortController: AbortController; timeoutId: NodeJS.Timeout }
  > = new Map();
  private organizationId: string | null = process.env.ORGANIZATION_ID || null;

  // Task handlers directory matching seed workloads
  private handlers: Record<string, TaskHandler> = {
    'Email Welcome Packet - User 1083': async (payload, log) => {
      const p = payload as { email: string };
      await log('Initiating email rendering for welcome template...');
      await new Promise((r) => setTimeout(r, 1000));
      await log(`Sending welcome email payload to ${p.email}...`);
      await new Promise((r) => setTimeout(r, 1000));
      await log('Email SMTP relay accepted payload.');
    },
    'Video Encoding - Tutorial 1': async (payload, log) => {
      const p = payload as {
        inputPath: string;
        format: string;
        resolution: string;
      };
      await log(`Loading video source file from ${p.inputPath}...`);
      await new Promise((r) => setTimeout(r, 1500));
      await log(`Encoding video stream in format ${p.format} at resolution ${p.resolution}...`);
      await new Promise((r) => setTimeout(r, 1500));
      await log('Finalizing video rendering and uploading to S3.');
    },
    'Regenerate Sitemap': async (payload, log) => {
      const p = payload as { domains?: string[] };
      await log('Generating URL list from DB...');
      await new Promise((r) => setTimeout(r, 800));
      await log(`Syncing sitemap XML structure to domains: ${p.domains?.join(', ')}`);
    },
  };

  constructor(name: string, concurrencyLimit: number = 5) {
    this.workerId = '';
    this.name = name;
    this.hostName = os.hostname();
    this.concurrencyLimit = concurrencyLimit;
  }

  /**
   * Helper to dispatch events to the central WebSocket server
   */
  private async dispatchEvent(
    organizationId: string,
    projectId: string | null,
    type: string,
    payload: unknown,
  ): Promise<void> {
    try {
      const port = process.env.PORT || 4000;
      await fetch(`http://localhost:${port}/api/internal/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          organizationId,
          event: { type, payload },
        }),
      });
    } catch (err) {
      // Ignore broadcast errors
    }
  }

  /**
   * Starts the Worker Service
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Register Worker in DB
    await this.register();
    console.log(`🤖 Worker ${this.name} (${this.workerId}) registered on host ${this.hostName}`);

    // 2. Start Heartbeat Loop
    this.startHeartbeat();

    // 3. Start Polling Loop
    this.startPolling();

    // 4. Register Process Signal Listeners for Graceful Shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Registers worker instance in database
   */
  private async register(): Promise<void> {
    const worker = await prisma.workers.create({
      data: {
        name: this.name,
        hostName: this.hostName,
        status: WorkerStatus.ACTIVE,
        concurrencyLimit: this.concurrencyLimit,
        activeJobsCount: 0,
      },
    });
    this.workerId = worker.id;
  }

  /**
   * Heartbeat Loop sending telemetry every 5 seconds
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (!this.workerId) return;

        // Collect system telemetry
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;
        const cpuUsage = os.loadavg()[0] * 10; // CPU load average over 1 minute

        await prisma.$transaction(async (tx) => {
          // Update worker active status
          await tx.workers.update({
            where: { id: this.workerId },
            data: {
              activeJobsCount: this.activeJobsCount,
              status: this.activeJobsCount === 0 ? WorkerStatus.IDLE : WorkerStatus.ACTIVE,
            },
          });

          // Insert heartbeat metric entry
          await tx.workerHeartbeats.create({
            data: {
              workerId: this.workerId,
              activeJobsCount: this.activeJobsCount,
              cpuUsage,
              memoryUsage,
            },
          });
        });

        // Broadcast telemetry heartbeat if organization context exists
        if (this.organizationId) {
          await this.dispatchEvent(this.organizationId, null, 'WORKER_STATUS_UPDATED', {
            id: this.workerId,
            name: this.name,
            status: this.activeJobsCount === 0 ? WorkerStatus.IDLE : WorkerStatus.ACTIVE,
            activeJobsCount: this.activeJobsCount,
            concurrencyLimit: this.concurrencyLimit,
            cpuUsage,
            memoryUsage,
          });
        }
      } catch (err) {
        console.error(`❌ Heartbeat failed for worker ${this.name}:`, err);
      }
    }, 5000);
  }

  /**
   * Polls the database for jobs to execute
   */
  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      try {
        if (!this.isRunning) return;

        // Check if worker has free concurrency slots
        const capacity = this.concurrencyLimit - this.activeJobsCount;
        if (capacity <= 0) return;

        // Attempt to claim and execute a job
        await this.pollAndClaim();
      } catch (err) {
        console.error('❌ Polling execution error:', err);
      }
    }, 1000); // Poll every second
  }

  /**
   * Claims a job atomically using PostgreSQL row-level locks (SKIP LOCKED)
   */
  private async pollAndClaim(): Promise<void> {
    // Atomic claiming query protecting against race conditions and respecting queue max concurrency
    const claimedJobs: Jobs[] = await prisma.$queryRawUnsafe(
      `
      UPDATE "Jobs"
      SET 
        "status" = 'RUNNING',
        "lockedByWorkerId" = $1,
        "lockedAt" = NOW(),
        "currentRetryCount" = "currentRetryCount" + 1,
        "updatedAt" = NOW()
      WHERE "id" = (
        SELECT j."id"
        FROM "Jobs" j
        JOIN "Queues" q ON j."queueId" = q."id"
        WHERE j."status" = 'QUEUED'
          AND j."runAt" <= NOW()
          AND q."isPaused" = FALSE
          AND j."isDeleted" = FALSE
          AND q."isDeleted" = FALSE
          -- Concurrency check: running count of jobs in this queue must be less than maxConcurrency
          AND (
            SELECT COUNT(1)
            FROM "Jobs" rj
            WHERE rj."queueId" = j."queueId"
              AND rj."status" = 'RUNNING'
              AND rj."isDeleted" = FALSE
          ) < q."maxConcurrency"
          -- Dependency check: all parent jobs must be COMPLETED
          AND (
            j."parentJobIds" = '{}'::text[]
            OR NOT EXISTS (
              SELECT 1 
              FROM "Jobs" pj 
              WHERE pj."id" = ANY(j."parentJobIds") 
                AND pj."status" != 'COMPLETED'
            )
          )
        ORDER BY q."priority" DESC, j."createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `,
      this.workerId,
    );

    if (claimedJobs && claimedJobs.length > 0) {
      const job = claimedJobs[0];
      this.activeJobsCount++;
      // Spawn async execution
      this.executeJob(job).catch((err) => {
        console.error(`❌ Critical error executing job ${job.id}:`, err);
      });
    }
  }

  /**
   * Executes the claimed job within an isolated handler environment
   */
  private async executeJob(job: Jobs): Promise<void> {
    const startedAt = new Date();
    let executionStatus = 'SUCCESS';
    let errorMessage: string | null = null;
    let stackTrace: string | null = null;

    // Lookup organization context for WebSocket broadcasts
    const jobWithProject = await prisma.jobs.findFirst({
      where: { id: job.id },
      include: { project: { select: { organizationId: true } } },
    });
    const orgId = jobWithProject?.project.organizationId || this.organizationId;

    // Broadcast RUNNING status
    if (orgId) {
      await this.dispatchEvent(orgId, job.projectId, 'JOB_STATUS_UPDATED', {
        id: job.id,
        name: job.name,
        status: JobStatus.RUNNING,
        runAt: job.runAt,
        queueId: job.queueId,
        projectId: job.projectId,
      });

      await this.dispatchEvent(orgId, null, 'WORKER_STATUS_UPDATED', {
        id: this.workerId,
        name: this.name,
        status: WorkerStatus.ACTIVE,
        activeJobsCount: this.activeJobsCount,
        concurrencyLimit: this.concurrencyLimit,
      });
    }

    // 1. Create Job Execution Audit Log
    const execution = await prisma.jobExecutions.create({
      data: {
        jobId: job.id,
        workerId: this.workerId,
        workerName: this.name,
        status: 'RUNNING',
        startedAt,
        attempt: job.currentRetryCount,
        durationMs: 0,
      },
    });

    // Logging helper
    const logHelper = async (msg: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
      console.log(`[Job ${job.id}] [${level}] ${msg}`);
      await prisma.jobLogs.create({
        data: {
          executionId: execution.id,
          jobId: job.id,
          level,
          message: msg,
        },
      });
    };

    await logHelper(`Job execution attempt ${job.currentRetryCount} started on ${this.name}.`);

    // Setup cancellation and timeout controls
    const abortController = new AbortController();
    const payloadObj = job.payload as Record<string, unknown> | null;
    const timeoutMs = typeof payloadObj?.timeoutMs === 'number' ? payloadObj.timeoutMs : 30000; // default 30s timeout

    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    this.activeTasks.set(job.id, { abortController, timeoutId });

    try {
      // Fetch the appropriate handler
      const handler = this.handlers[job.name] || this.defaultHandler;

      // Execute handler passing abort signal
      await Promise.race([
        handler(job.payload, logHelper),
        new Promise((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error(`Execution timeout: exceeded ${timeoutMs}ms limit.`));
          });
        }),
      ]);

      await logHelper('Job execution completed successfully.');
    } catch (err) {
      const error = err as Error;
      executionStatus = 'FAILED';
      errorMessage = error.message || 'Unknown execution error';
      stackTrace = error.stack || null;
      await logHelper(`Execution failed: ${errorMessage}`, 'ERROR');
    } finally {
      // Clear timeout triggers
      clearTimeout(timeoutId);
      this.activeTasks.delete(job.id);

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      // 2. Update Execution History Record
      await prisma.jobExecutions.update({
        where: { id: execution.id },
        data: {
          status: executionStatus,
          finishedAt,
          durationMs,
          errorMessage,
          stackTrace,
        },
      });

      // 3. Resolve Job State Transitions and emit events
      await this.handleJobCompletion(job, executionStatus, errorMessage, stackTrace, orgId);

      this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
    }
  }

  /**
   * Dynamic fallback handler representing standard background CPU task sleep simulations
   */
  private async defaultHandler(
    _payload: unknown,
    log: (msg: string, level?: 'INFO' | 'WARN' | 'ERROR') => Promise<void>,
  ): Promise<void> {
    await log('Executing generic CPU task sleep simulation...');
    const duration = 1000 + Math.floor(Math.random() * 2000); // 1-3 seconds
    await new Promise((resolve) => setTimeout(resolve, duration));

    const payloadObj = _payload as Record<string, unknown> | null;
    // Simulate sporadic failures for demo purposes if configured
    if (payloadObj?.simulateFailure) {
      throw new Error('SimulationError: Random failure triggered in payload options.');
    }

    await log(`Generic sleep task resolved in ${duration}ms.`);
  }

  /**
   * Manages job retries and Dead Letter Queue (DLQ) state machine transitions
   */
  private async handleJobCompletion(
    job: Jobs,
    status: string,
    errorMsg: string | null,
    stackTrace: string | null,
    orgId: string | null,
  ): Promise<void> {
    try {
      if (status === 'SUCCESS') {
        // Success: Mark completed and release worker locks
        const updatedJob = await prisma.jobs.update({
          where: { id: job.id },
          data: {
            status: JobStatus.COMPLETED,
            lockedByWorkerId: null,
            lockedAt: null,
          },
        });

        // Broadcast success status
        if (orgId) {
          await this.dispatchEvent(orgId, job.projectId, 'JOB_STATUS_UPDATED', updatedJob);
          await this.dispatchEvent(orgId, null, 'WORKER_STATUS_UPDATED', {
            id: this.workerId,
            name: this.name,
            status: this.activeJobsCount - 1 <= 0 ? WorkerStatus.IDLE : WorkerStatus.ACTIVE,
            activeJobsCount: Math.max(0, this.activeJobsCount - 1),
            concurrencyLimit: this.concurrencyLimit,
          });
        }
      } else {
        // Failure: Fetch queue configuration to check retry policy
        const queue = await prisma.queues.findFirst({
          where: { id: job.queueId },
          include: { retryPolicy: true },
        });

        const policy = queue?.retryPolicy;
        const maxRetries = job.maxRetries;

        if (policy && job.currentRetryCount < maxRetries) {
          // Calculate delay based on backoff strategy
          const delaySeconds = RetryService.calculateDelay(policy, job.currentRetryCount);

          const runAt = new Date(Date.now() + delaySeconds * 1000);

          // Reschedule job to QUEUED (with future runAt target)
          const updatedJob = await prisma.jobs.update({
            where: { id: job.id },
            data: {
              status: JobStatus.QUEUED,
              runAt,
              lockedByWorkerId: null,
              lockedAt: null,
            },
          });

          console.log(
            `♻️ Job ${job.id} failed. Rescheduled to retry at ${runAt.toISOString()} (Delay: ${delaySeconds}s)`,
          );

          // Broadcast rescheduled status
          if (orgId) {
            await this.dispatchEvent(orgId, job.projectId, 'JOB_STATUS_UPDATED', updatedJob);
            await this.dispatchEvent(orgId, null, 'WORKER_STATUS_UPDATED', {
              id: this.workerId,
              name: this.name,
              status: this.activeJobsCount - 1 <= 0 ? WorkerStatus.IDLE : WorkerStatus.ACTIVE,
              activeJobsCount: Math.max(0, this.activeJobsCount - 1),
              concurrencyLimit: this.concurrencyLimit,
            });
          }
        } else {
          // Retries exhausted: Route to Dead Letter Queue (DLQ)
          const [updatedJob] = await prisma.$transaction([
            prisma.jobs.update({
              where: { id: job.id },
              data: {
                status: JobStatus.FAILED,
                lockedByWorkerId: null,
                lockedAt: null,
              },
            }),
            prisma.deadLetterQueue.create({
              data: {
                jobId: job.id,
                queueId: job.queueId,
                reason: errorMsg || 'Execution retries exhausted',
                stackTrace,
                originalPayload: job.payload as Prisma.InputJsonValue,
              },
            }),
          ]);

          console.log(
            `💀 Job ${job.id} failed permanently and has been routed to the Dead Letter Queue (DLQ).`,
          );

          // Broadcast failed status
          if (orgId) {
            await this.dispatchEvent(orgId, job.projectId, 'JOB_STATUS_UPDATED', updatedJob);
            await this.dispatchEvent(orgId, null, 'WORKER_STATUS_UPDATED', {
              id: this.workerId,
              name: this.name,
              status: this.activeJobsCount - 1 <= 0 ? WorkerStatus.IDLE : WorkerStatus.ACTIVE,
              activeJobsCount: Math.max(0, this.activeJobsCount - 1),
              concurrencyLimit: this.concurrencyLimit,
            });
          }
        }
      }
    } catch (err) {
      console.error(`❌ Error updating state machine for job ${job.id}:`, err);
    }
  }

  /**
   * Initiates process graceful shutdown
   */
  public async shutdown(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    console.log(`🛑 Graceful shutdown initiated for worker ${this.name}...`);

    // Stop polling and heartbeat tickers
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    // Set worker offline in database
    if (this.workerId) {
      try {
        await prisma.workers.update({
          where: { id: this.workerId },
          data: { status: WorkerStatus.OFFLINE },
        });

        // Broadcast offline status
        if (this.organizationId) {
          await this.dispatchEvent(this.organizationId, null, 'WORKER_STATUS_UPDATED', {
            id: this.workerId,
            name: this.name,
            status: WorkerStatus.OFFLINE,
            activeJobsCount: 0,
            concurrencyLimit: this.concurrencyLimit,
          });
        }
      } catch (err) {
        console.error('Error updating worker status during shutdown:', err);
      }
    }

    // Wait for active tasks to complete or abort them
    if (this.activeTasks.size > 0) {
      console.log(`Waiting for ${this.activeTasks.size} active tasks to finish...`);

      // Wait up to 5 seconds
      const gracePeriod = new Promise((resolve) => setTimeout(resolve, 5000));

      await Promise.race([
        gracePeriod,
        new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (this.activeJobsCount === 0) {
              clearInterval(check);
              resolve();
            }
          }, 500);
        }),
      ]);

      // Abort any remaining tasks and re-enqueue them in DB
      if (this.activeTasks.size > 0) {
        console.log(
          `Grace period elapsed. Aborting ${this.activeTasks.size} remaining running tasks...`,
        );
        for (const [jobId, task] of this.activeTasks.entries()) {
          task.abortController.abort();

          // Release row locks in DB so other nodes pick them up
          try {
            await prisma.jobs.update({
              where: { id: jobId },
              data: {
                status: JobStatus.QUEUED,
                lockedByWorkerId: null,
                lockedAt: null,
                currentRetryCount: { decrement: 1 }, // refund the attempt increment
              },
            });
          } catch (err) {
            console.error(`Failed to release lock for aborted job ${jobId}:`, err);
          }
        }
      }
    }

    await prisma.$disconnect();
    console.log('🔌 Database connection closed. Worker stopped.');
    process.exit(0);
  }
}
