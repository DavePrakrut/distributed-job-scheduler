import { Response, NextFunction } from 'express';
import prisma from '../config/db';
import { AuthenticatedRequest } from '../types';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { RetryStrategy } from '@prisma/client';
import { WebSocketManager } from '../services/websocket.service';

export class QueueController {
  /**
   * Lists all queues inside a specific project, including real-time job counts.
   */
  public static async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { projectId } = req.params;
      const { organizationId } = req.user;

      // Verify project exists and belongs to organization
      const project = await prisma.projects.findFirst({
        where: {
          id: projectId,
          organizationId,
          isDeleted: false,
        },
      });

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Fetch all active queues
      const queues = await prisma.queues.findMany({
        where: {
          projectId,
          isDeleted: false,
        },
        include: {
          retryPolicy: true,
        },
        orderBy: {
          priority: 'desc',
        },
      });

      // Aggregate job counts by status for all queues in the project
      const jobCounts = await prisma.jobs.groupBy({
        by: ['queueId', 'status'],
        where: {
          projectId,
          isDeleted: false,
        },
        _count: {
          id: true,
        },
      });

      // Map counts back to queues
      const queuesWithStats = queues.map((q) => {
        const stats = {
          queued: 0,
          running: 0,
          completed: 0,
          failed: 0,
          scheduled: 0,
          cancelled: 0,
        };

        const qCounts = jobCounts.filter((c) => c.queueId === q.id);
        for (const item of qCounts) {
          const statusKey = item.status.toLowerCase() as keyof typeof stats;
          if (statusKey in stats) {
            stats[statusKey] = item._count.id;
          }
        }

        return {
          ...q,
          stats,
        };
      });

      res.json(queuesWithStats);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Fetches details and statistics of a specific queue.
   */
  public static async get(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { organizationId } = req.user;

      // Fetch queue and include parent project to verify tenant
      const queue = await prisma.queues.findFirst({
        where: {
          id,
          isDeleted: false,
        },
        include: {
          project: true,
          retryPolicy: true,
        },
      });

      if (!queue || queue.project.organizationId !== organizationId || queue.project.isDeleted) {
        throw new NotFoundError('Queue not found');
      }

      // Aggregate counts by status
      const jobCounts = await prisma.jobs.groupBy({
        by: ['status'],
        where: {
          queueId: id,
          isDeleted: false,
        },
        _count: {
          id: true,
        },
      });

      const stats = {
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        scheduled: 0,
        cancelled: 0,
      };

      for (const item of jobCounts) {
        const statusKey = item.status.toLowerCase() as keyof typeof stats;
        if (statusKey in stats) {
          stats[statusKey] = item._count.id;
        }
      }

      // Remove sensitive parent context before returning
      const queueDetails = {
        id: queue.id,
        name: queue.name,
        projectId: queue.projectId,
        priority: queue.priority,
        maxConcurrency: queue.maxConcurrency,
        isPaused: queue.isPaused,
        retryPolicyId: queue.retryPolicyId,
        retryPolicy: queue.retryPolicy,
        createdAt: queue.createdAt,
        updatedAt: queue.updatedAt,
      };

      res.json({
        ...queueDetails,
        stats,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Creates a new queue under a project.
   */
  public static async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { projectId } = req.params;
      const {
        name,
        priority,
        maxConcurrency,
        retryPolicyId,
        retryStrategy,
        maxRetries,
        baseDelaySeconds,
        factor,
      } = req.body;
      const { organizationId } = req.user;

      // Verify project exists
      const project = await prisma.projects.findFirst({
        where: {
          id: projectId,
          organizationId,
          isDeleted: false,
        },
      });

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check name uniqueness in project
      const existingQueue = await prisma.queues.findFirst({
        where: {
          name,
          projectId,
          isDeleted: false,
        },
      });

      if (existingQueue) {
        throw new BadRequestError('Queue with this name already exists in the project');
      }

      // Resolve or create Retry Policy
      let resolvedPolicyId = retryPolicyId;
      if (!resolvedPolicyId) {
        const strategy = (retryStrategy as RetryStrategy) || RetryStrategy.FIXED;
        const max = maxRetries !== undefined ? Number(maxRetries) : 3;
        const base = baseDelaySeconds !== undefined ? Number(baseDelaySeconds) : 5;
        const fact = factor !== undefined ? Number(factor) : 2.0;

        // Try to find matching active policy
        let policy = await prisma.retryPolicies.findFirst({
          where: {
            strategy,
            maxRetries: max,
            baseDelaySeconds: base,
            factor: fact,
            isDeleted: false,
          },
        });

        if (!policy) {
          const policyName = `Inline_${strategy}_${max}x_${base}s`;
          policy = await prisma.retryPolicies.create({
            data: {
              name: policyName,
              strategy,
              maxRetries: max,
              baseDelaySeconds: base,
              factor: fact,
            },
          });
        }
        resolvedPolicyId = policy.id;
      } else {
        // Verify policy exists
        const policyExists = await prisma.retryPolicies.findFirst({
          where: { id: resolvedPolicyId, isDeleted: false },
        });
        if (!policyExists) {
          throw new BadRequestError('Specified Retry Policy not found');
        }
      }

      const queue = await prisma.queues.create({
        data: {
          name,
          projectId,
          priority: priority !== undefined ? Number(priority) : 1,
          maxConcurrency: maxConcurrency !== undefined ? Number(maxConcurrency) : 5,
          retryPolicyId: resolvedPolicyId,
        },
        include: {
          retryPolicy: true,
        },
      });

      WebSocketManager.getInstance().broadcastToProject(projectId, organizationId, {
        type: 'QUEUE_STATUS_UPDATED',
        payload: queue,
      });

      res.status(201).json(queue);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Updates properties of a specific queue.
   */
  public static async update(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { name, priority, maxConcurrency, retryPolicyId } = req.body;
      const { organizationId } = req.user;

      // Verify queue exists and belongs to tenant
      const queue = await prisma.queues.findFirst({
        where: {
          id,
          isDeleted: false,
        },
        include: {
          project: true,
        },
      });

      if (!queue || queue.project.organizationId !== organizationId || queue.project.isDeleted) {
        throw new NotFoundError('Queue not found');
      }

      // Check name uniqueness if updated
      if (name && name !== queue.name) {
        const nameCollision = await prisma.queues.findFirst({
          where: {
            name,
            projectId: queue.projectId,
            isDeleted: false,
            id: { not: id },
          },
        });
        if (nameCollision) {
          throw new BadRequestError('Another queue with this name already exists in the project');
        }
      }

      // Verify policy if updated
      if (retryPolicyId) {
        const policyExists = await prisma.retryPolicies.findFirst({
          where: { id: retryPolicyId, isDeleted: false },
        });
        if (!policyExists) {
          throw new BadRequestError('Specified Retry Policy not found');
        }
      }

      const updatedQueue = await prisma.queues.update({
        where: { id },
        data: {
          name: name !== undefined ? name : undefined,
          priority: priority !== undefined ? Number(priority) : undefined,
          maxConcurrency: maxConcurrency !== undefined ? Number(maxConcurrency) : undefined,
          retryPolicyId: retryPolicyId !== undefined ? retryPolicyId : undefined,
        },
        include: {
          retryPolicy: true,
        },
      });

      WebSocketManager.getInstance().broadcastToProject(updatedQueue.projectId, organizationId, {
        type: 'QUEUE_STATUS_UPDATED',
        payload: updatedQueue,
      });

      res.json(updatedQueue);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Dynamically pauses queue execution.
   */
  public static async pause(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { organizationId } = req.user;

      const queue = await prisma.queues.findFirst({
        where: {
          id,
          isDeleted: false,
        },
        include: {
          project: true,
        },
      });

      if (!queue || queue.project.organizationId !== organizationId || queue.project.isDeleted) {
        throw new NotFoundError('Queue not found');
      }

      const updatedQueue = await prisma.queues.update({
        where: { id },
        data: { isPaused: true },
      });

      WebSocketManager.getInstance().broadcastToProject(updatedQueue.projectId, organizationId, {
        type: 'QUEUE_STATUS_UPDATED',
        payload: updatedQueue,
      });

      res.json(updatedQueue);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Dynamically resumes queue execution.
   */
  public static async resume(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { organizationId } = req.user;

      const queue = await prisma.queues.findFirst({
        where: {
          id,
          isDeleted: false,
        },
        include: {
          project: true,
        },
      });

      if (!queue || queue.project.organizationId !== organizationId || queue.project.isDeleted) {
        throw new NotFoundError('Queue not found');
      }

      const updatedQueue = await prisma.queues.update({
        where: { id },
        data: { isPaused: false },
      });

      WebSocketManager.getInstance().broadcastToProject(updatedQueue.projectId, organizationId, {
        type: 'QUEUE_STATUS_UPDATED',
        payload: updatedQueue,
      });

      res.json(updatedQueue);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Soft deletes a queue and associated jobs and scheduled jobs.
   */
  public static async delete(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { organizationId } = req.user;

      const queue = await prisma.queues.findFirst({
        where: {
          id,
          isDeleted: false,
        },
        include: {
          project: true,
        },
      });

      if (!queue || queue.project.organizationId !== organizationId || queue.project.isDeleted) {
        throw new NotFoundError('Queue not found');
      }

      const deleteTime = new Date();

      await prisma.$transaction(async (tx) => {
        // Soft delete the Queue
        await tx.queues.update({
          where: { id },
          data: {
            isDeleted: true,
            deletedAt: deleteTime,
          },
        });

        // Soft delete all active Jobs in this queue
        await tx.jobs.updateMany({
          where: { queueId: id, isDeleted: false },
          data: {
            isDeleted: true,
            deletedAt: deleteTime,
          },
        });

        // Soft delete all active ScheduledJobs in this queue
        await tx.scheduledJobs.updateMany({
          where: { queueId: id, isDeleted: false },
          data: {
            isDeleted: true,
            deletedAt: deleteTime,
          },
        });
      });

      WebSocketManager.getInstance().broadcastToProject(queue.projectId, organizationId, {
        type: 'QUEUE_DELETED',
        payload: { id },
      });

      res.json({
        message: 'Queue and associated resources soft-deleted successfully',
        id,
      });
    } catch (err) {
      next(err);
    }
  }
}
