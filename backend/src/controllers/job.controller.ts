import { Response, NextFunction } from 'express';
import cronParser from 'cron-parser';
import { randomUUID } from 'crypto';
import prisma from '../config/db';
import { AuthenticatedRequest } from '../types';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { JobStatus, Prisma } from '@prisma/client';
import { WebSocketManager } from '../services/websocket.service';

export class JobController {
  /**
   * Submits a single immediate or delayed job.
   */
  public static async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { projectId } = req.params;
      const { name, queueId, payload, runAt, maxRetries, parentJobIds } = req.body;
      const { organizationId } = req.user;

      // Verify project exists and belongs to tenant
      const project = await prisma.projects.findFirst({
        where: { id: projectId, organizationId, isDeleted: false },
      });
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Verify queue exists, belongs to project, and is active
      const queue = await prisma.queues.findFirst({
        where: { id: queueId, projectId, isDeleted: false },
      });
      if (!queue) {
        throw new NotFoundError('Queue not found');
      }

      const runTime = runAt ? new Date(runAt) : new Date();
      if (isNaN(runTime.getTime())) {
        throw new BadRequestError('Invalid runAt date format');
      }

      // Determine initial status based on execution target time
      const isDelayed = runTime.getTime() > Date.now();
      const status = isDelayed ? JobStatus.SCHEDULED : JobStatus.QUEUED;

      // Validate parent dependencies exist and belong to the same project
      if (parentJobIds && Array.isArray(parentJobIds) && parentJobIds.length > 0) {
        const parents = await prisma.jobs.findMany({
          where: {
            id: { in: parentJobIds },
            projectId,
            isDeleted: false,
          },
        });
        if (parents.length !== parentJobIds.length) {
          throw new BadRequestError(
            'One or more dependent parentJobIds are invalid or belong to a different project',
          );
        }
      }

      const job = await prisma.jobs.create({
        data: {
          name,
          queueId,
          projectId,
          payload: payload || {},
          status,
          runAt: runTime,
          maxRetries: maxRetries !== undefined ? Number(maxRetries) : queue.maxConcurrency,
          parentJobIds: parentJobIds || [],
        },
      });

      // Broadcast real-time update
      WebSocketManager.getInstance().broadcastToProject(projectId, organizationId, {
        type: 'JOB_STATUS_UPDATED',
        payload: job,
      });

      res.status(201).json(job);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Registers a recurring cron job template.
   */
  public static async createSchedule(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { projectId } = req.params;
      const { name, queueId, payload, cronExpression } = req.body;
      const { organizationId } = req.user;

      // Verify project
      const project = await prisma.projects.findFirst({
        where: { id: projectId, organizationId, isDeleted: false },
      });
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Verify queue
      const queue = await prisma.queues.findFirst({
        where: { id: queueId, projectId, isDeleted: false },
      });
      if (!queue) {
        throw new NotFoundError('Queue not found');
      }

      // Validate cron expression and calculate next execution time
      let nextRunAt: Date;
      try {
        const interval = cronParser.parseExpression(cronExpression);
        nextRunAt = interval.next().toDate();
      } catch (err) {
        throw new BadRequestError('Invalid cron expression format');
      }

      const schedule = await prisma.scheduledJobs.create({
        data: {
          name,
          cronExpression,
          projectId,
          queueId,
          payload: payload || {},
          nextRunAt,
        },
      });

      // Broadcast update
      WebSocketManager.getInstance().broadcastToProject(projectId, organizationId, {
        type: 'SCHEDULE_STATUS_UPDATED',
        payload: schedule,
      });

      res.status(201).json(schedule);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Submits a batch of jobs.
   */
  public static async createBatch(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { projectId } = req.params;
      const { name, jobs } = req.body;
      const { organizationId } = req.user;

      if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
        throw new BadRequestError('Batch must contain at least one job definition');
      }

      // Verify project
      const project = await prisma.projects.findFirst({
        where: { id: projectId, organizationId, isDeleted: false },
      });
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Map queues checks (batch jobs can span different queues in the same project)
      const queueIds = Array.from(new Set((jobs as { queueId: string }[]).map((j) => j.queueId)));
      const activeQueues = await prisma.queues.findMany({
        where: {
          id: { in: queueIds },
          projectId,
          isDeleted: false,
        },
      });

      if (activeQueues.length !== queueIds.length) {
        throw new BadRequestError(
          'One or more queueIds specified in batch are invalid or do not belong to this project',
        );
      }

      // Generate a batch grouping UUID
      const batchId = randomUUID();

      // Execute atomic transaction for jobs enqueuing
      const createdJobs = await prisma.$transaction(async (tx) => {
        return Promise.all(
          (
            jobs as {
              name: string;
              queueId: string;
              payload?: Prisma.InputJsonValue;
              runAt?: string;
              maxRetries?: number;
            }[]
          ).map(async (j) => {
            const runTime = j.runAt ? new Date(j.runAt) : new Date();
            const isDelayed = runTime.getTime() > Date.now();
            const status = isDelayed ? JobStatus.SCHEDULED : JobStatus.QUEUED;

            return tx.jobs.create({
              data: {
                name: j.name,
                queueId: j.queueId,
                projectId,
                payload: j.payload || {},
                status,
                runAt: runTime,
                maxRetries: j.maxRetries !== undefined ? Number(j.maxRetries) : 3,
                batchId,
              },
            });
          }),
        );
      });

      // Broadcast batch creation event
      WebSocketManager.getInstance().broadcastToProject(projectId, organizationId, {
        type: 'BATCH_STATUS_UPDATED',
        payload: {
          batchId,
          batchName: name,
          jobsCount: createdJobs.length,
        },
      });

      res.status(201).json({
        batchId,
        batchName: name,
        jobsCount: createdJobs.length,
        jobs: createdJobs,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Lists jobs with advanced pagination, filtering, sorting, and name search.
   */
  public static async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { projectId } = req.params;
      const { organizationId } = req.user;

      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const { status, queueId, batchId, search, sortBy, sortOrder } = req.query;

      // Verify project belongs to organization
      const project = await prisma.projects.findFirst({
        where: { id: projectId, organizationId, isDeleted: false },
      });
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Build Dynamic Filters
      const whereClause: Prisma.JobsWhereInput = {
        projectId,
        isDeleted: false,
      };

      if (status) {
        whereClause.status = status as JobStatus;
      }
      if (queueId) {
        whereClause.queueId = queueId as string;
      }
      if (batchId) {
        whereClause.batchId = batchId as string;
      }
      if (search && typeof search === 'string') {
        whereClause.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { id: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Sorting configs
      const orderColumn = (sortBy as string) || 'createdAt';
      const orderDirection = (sortOrder as 'asc' | 'desc') || 'desc';

      const [jobs, totalCount] = await prisma.$transaction([
        prisma.jobs.findMany({
          where: whereClause,
          include: {
            queue: { select: { name: true } },
          },
          orderBy: {
            [orderColumn]: orderDirection,
          },
          skip,
          take: limit,
        }),
        prisma.jobs.count({
          where: whereClause,
        }),
      ]);

      res.json({
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
        jobs,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retrieves detail logs, executions, and telemetry of a job.
   */
  public static async get(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { organizationId } = req.user;

      const job = await prisma.jobs.findFirst({
        where: {
          id,
          isDeleted: false,
        },
        include: {
          project: true,
          queue: { select: { name: true } },
          executions: {
            orderBy: { startedAt: 'desc' },
            include: {
              jobLogs: { orderBy: { timestamp: 'asc' } },
            },
          },
        },
      });

      if (!job || job.project.organizationId !== organizationId || job.project.isDeleted) {
        throw new NotFoundError('Job not found');
      }

      // Calculate batch stats if the job is part of a batch grouping
      let batchStats = null;
      if (job.batchId) {
        const batchJobs = await prisma.jobs.groupBy({
          by: ['status'],
          where: {
            batchId: job.batchId,
            isDeleted: false,
          },
          _count: {
            id: true,
          },
        });

        const stats = {
          total: 0,
          completed: 0,
          failed: 0,
          running: 0,
          pending: 0,
        };

        for (const item of batchJobs) {
          stats.total += item._count.id;
          if (item.status === JobStatus.COMPLETED) {
            stats.completed = item._count.id;
          } else if (item.status === JobStatus.FAILED) {
            stats.failed = item._count.id;
          } else if (item.status === JobStatus.RUNNING) {
            stats.running = item._count.id;
          } else {
            stats.pending += item._count.id;
          }
        }
        batchStats = stats;
      }

      // Construct properties explicitly to avoid parent project exposure
      const jobDetails = {
        id: job.id,
        name: job.name,
        payload: job.payload,
        status: job.status,
        runAt: job.runAt,
        lockedByWorkerId: job.lockedByWorkerId,
        lockedAt: job.lockedAt,
        queueId: job.queueId,
        projectId: job.projectId,
        parentJobIds: job.parentJobIds,
        maxRetries: job.maxRetries,
        currentRetryCount: job.currentRetryCount,
        executions: job.executions,
        queue: job.queue,
        batchId: job.batchId,
        batchStats,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };

      res.json(jobDetails);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Manually retries a failed or dead-lettered job immediately.
   */
  public static async retry(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { organizationId } = req.user;

      const job = await prisma.jobs.findFirst({
        where: { id, isDeleted: false },
        include: { project: true },
      });

      if (!job || job.project.organizationId !== organizationId || job.project.isDeleted) {
        throw new NotFoundError('Job not found');
      }

      if (job.status !== JobStatus.FAILED && job.status !== JobStatus.CANCELLED) {
        throw new BadRequestError('Only failed or cancelled jobs can be manually retried');
      }

      // Reset state in database transaction (clears DLQ if exists)
      const updatedJob = await prisma.$transaction(async (tx) => {
        // Remove from DLQ if it has an entry
        await tx.deadLetterQueue.deleteMany({
          where: { jobId: id },
        });

        // Update status back to QUEUED
        return tx.jobs.update({
          where: { id },
          data: {
            status: JobStatus.QUEUED,
            currentRetryCount: 0,
            runAt: new Date(),
            lockedByWorkerId: null,
            lockedAt: null,
          },
        });
      });

      // Broadcast update
      WebSocketManager.getInstance().broadcastToProject(job.projectId, organizationId, {
        type: 'JOB_STATUS_UPDATED',
        payload: updatedJob,
      });

      res.json({
        message: 'Job re-enqueued for execution successfully',
        job: updatedJob,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Cancels a queued or scheduled job.
   */
  public static async cancel(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { organizationId } = req.user;

      const job = await prisma.jobs.findFirst({
        where: { id, isDeleted: false },
        include: { project: true },
      });

      if (!job || job.project.organizationId !== organizationId || job.project.isDeleted) {
        throw new NotFoundError('Job not found');
      }

      if (job.status !== JobStatus.QUEUED && job.status !== JobStatus.SCHEDULED) {
        throw new BadRequestError('Only pending or scheduled jobs can be cancelled');
      }

      const updatedJob = await prisma.jobs.update({
        where: { id },
        data: {
          status: JobStatus.CANCELLED,
          lockedByWorkerId: null,
          lockedAt: null,
        },
      });

      // Broadcast cancel event
      WebSocketManager.getInstance().broadcastToProject(job.projectId, organizationId, {
        type: 'JOB_STATUS_UPDATED',
        payload: updatedJob,
      });

      res.json({
        message: 'Job cancelled successfully',
        job: updatedJob,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Soft-deletes a job.
   */
  public static async delete(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { organizationId } = req.user;

      const job = await prisma.jobs.findFirst({
        where: { id, isDeleted: false },
        include: { project: true },
      });

      if (!job || job.project.organizationId !== organizationId || job.project.isDeleted) {
        throw new NotFoundError('Job not found');
      }

      await prisma.jobs.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      // Broadcast delete event
      WebSocketManager.getInstance().broadcastToProject(job.projectId, organizationId, {
        type: 'JOB_DELETED',
        payload: { id },
      });

      res.json({
        message: 'Job soft-deleted successfully',
        id,
      });
    } catch (err) {
      next(err);
    }
  }
}
