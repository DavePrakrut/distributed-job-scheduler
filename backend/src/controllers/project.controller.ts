import { Response, NextFunction } from 'express';
import prisma from '../config/db';
import { AuthenticatedRequest } from '../types';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';

export class ProjectController {
  /**
   * Lists all projects belonging to the user's organization.
   */
  public static async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { organizationId } = req.user;

      const projects = await prisma.projects.findMany({
        where: {
          organizationId,
          isDeleted: false,
        },
        include: {
          _count: {
            select: { queues: { where: { isDeleted: false } } },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.json(projects);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retrieves a specific project, including its associated active queues.
   */
  public static async get(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { organizationId } = req.user;

      const project = await prisma.projects.findFirst({
        where: {
          id,
          organizationId,
          isDeleted: false,
        },
        include: {
          queues: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      res.json(project);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Creates a new project in the user's organization.
   */
  public static async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { name } = req.body;
      const { organizationId } = req.user;

      // Check if active project with the same name already exists in organization
      const existingProject = await prisma.projects.findFirst({
        where: {
          name,
          organizationId,
          isDeleted: false,
        },
      });

      if (existingProject) {
        throw new BadRequestError('Project with this name already exists in your organization');
      }

      const project = await prisma.projects.create({
        data: {
          name,
          organizationId,
        },
      });

      res.status(201).json(project);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Updates the project's parameters.
   */
  public static async update(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const { organizationId } = req.user;

      // Verify project exists in the organization
      const project = await prisma.projects.findFirst({
        where: {
          id,
          organizationId,
          isDeleted: false,
        },
      });

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check name collision (with other projects)
      const existingProjectName = await prisma.projects.findFirst({
        where: {
          name,
          organizationId,
          isDeleted: false,
          id: { not: id },
        },
      });

      if (existingProjectName) {
        throw new BadRequestError('Another project with this name already exists');
      }

      const updatedProject = await prisma.projects.update({
        where: { id },
        data: { name },
      });

      res.json(updatedProject);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Soft deletes a project and propagates the deletion down to queues, jobs, and schedules.
   */
  public static async delete(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { organizationId } = req.user;

      // Verify project exists in the organization
      const project = await prisma.projects.findFirst({
        where: {
          id,
          organizationId,
          isDeleted: false,
        },
      });

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      const deleteTime = new Date();

      // Run soft delete updates in transaction
      await prisma.$transaction(async (tx) => {
        // Soft delete the project
        await tx.projects.update({
          where: { id },
          data: {
            isDeleted: true,
            deletedAt: deleteTime,
          },
        });

        // Soft delete associated Queues
        await tx.queues.updateMany({
          where: { projectId: id, isDeleted: false },
          data: {
            isDeleted: true,
            deletedAt: deleteTime,
          },
        });

        // Soft delete associated Jobs
        await tx.jobs.updateMany({
          where: { projectId: id, isDeleted: false },
          data: {
            isDeleted: true,
            deletedAt: deleteTime,
          },
        });

        // Soft delete associated ScheduledJobs
        await tx.scheduledJobs.updateMany({
          where: { projectId: id, isDeleted: false },
          data: {
            isDeleted: true,
            deletedAt: deleteTime,
          },
        });
      });

      res.json({
        message: 'Project and all associated resources soft-deleted successfully',
        id,
      });
    } catch (err) {
      next(err);
    }
  }
}
