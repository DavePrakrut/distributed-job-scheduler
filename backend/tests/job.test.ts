import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/db';
import { TokenService } from '../src/services/token.service';

jest.mock('../src/config/db', () => ({
  __esModule: true,
  default: {
    projects: {
      findFirst: jest.fn(),
    },
    queues: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    jobs: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    scheduledJobs: {
      create: jest.fn(),
    },
    deadLetterQueue: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((cb) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      if (Array.isArray(cb)) {
        return Promise.all(cb);
      }
      return cb;
    }),
  },
}));

const prismaMock = prisma as any;

const mockToken = TokenService.generateAccessToken({
  userId: 'mock-user-id',
  email: 'admin@acme.com',
  role: 'ADMIN',
  organizationId: 'mock-org-id',
});

describe('Job APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/projects/:projectId/jobs', () => {
    it('should submit an immediate job successfully', async () => {
      prismaMock.projects.findFirst.mockResolvedValue({ id: 'mock-proj-id' });
      prismaMock.queues.findFirst.mockResolvedValue({ id: 'mock-queue-id', maxConcurrency: 5 });
      prismaMock.jobs.create.mockResolvedValue({
        id: 'new-job-id',
        name: 'welcome-email',
        status: 'QUEUED',
        projectId: 'mock-proj-id',
        queueId: 'mock-queue-id',
      });

      const res = await request(app)
        .post('/api/projects/mock-proj-id/jobs')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          name: 'welcome-email',
          queueId: 'mock-queue-id',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('welcome-email');
      expect(res.body.status).toBe('QUEUED');
    });

    it('should submit a delayed job successfully', async () => {
      prismaMock.projects.findFirst.mockResolvedValue({ id: 'mock-proj-id' });
      prismaMock.queues.findFirst.mockResolvedValue({ id: 'mock-queue-id', maxConcurrency: 5 });
      const futureDate = new Date(Date.now() + 3600000);
      prismaMock.jobs.create.mockResolvedValue({
        id: 'new-job-id',
        name: 'welcome-email',
        status: 'SCHEDULED',
        projectId: 'mock-proj-id',
        queueId: 'mock-queue-id',
        runAt: futureDate.toISOString(),
      });

      const res = await request(app)
        .post('/api/projects/mock-proj-id/jobs')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          name: 'welcome-email',
          queueId: 'mock-queue-id',
          runAt: futureDate.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('SCHEDULED');
    });
  });

  describe('POST /api/projects/:projectId/schedules', () => {
    it('should create a recurring cron template successfully', async () => {
      prismaMock.projects.findFirst.mockResolvedValue({ id: 'mock-proj-id' });
      prismaMock.queues.findFirst.mockResolvedValue({ id: 'mock-queue-id' });
      prismaMock.scheduledJobs.create.mockResolvedValue({
        id: 'new-schedule-id',
        name: 'nightly-backup',
        cronExpression: '0 0 * * *',
      });

      const res = await request(app)
        .post('/api/projects/mock-proj-id/schedules')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          name: 'nightly-backup',
          queueId: 'mock-queue-id',
          cronExpression: '0 0 * * *',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('nightly-backup');
    });
  });

  describe('GET /api/projects/:projectId/jobs', () => {
    it('should return list of jobs with status filter', async () => {
      prismaMock.projects.findFirst.mockResolvedValue({ id: 'mock-proj-id' });
      prismaMock.jobs.findMany.mockResolvedValue([
        { id: 'j1', name: 'Job 1', status: 'COMPLETED' },
      ]);
      prismaMock.jobs.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/projects/mock-proj-id/jobs?status=COMPLETED')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.jobs.length).toBe(1);
      expect(res.body.totalCount).toBe(1);
    });
  });

  describe('GET /api/jobs/:id', () => {
    it('should return job details with batch progress calculation', async () => {
      prismaMock.jobs.findFirst.mockResolvedValue({
        id: 'j1',
        name: 'Job 1',
        status: 'RUNNING',
        batchId: 'mock-batch-id',
        projectId: 'mock-proj-id',
        project: { organizationId: 'mock-org-id' },
        executions: [],
        jobLogs: [],
      });
      // Mock groupBy result for batch progress
      prismaMock.jobs.groupBy.mockResolvedValue([
        { status: 'RUNNING', _count: { id: 1 } },
        { status: 'COMPLETED', _count: { id: 1 } },
      ]);

      const res = await request(app)
        .get('/api/jobs/j1')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('j1');
      expect(res.body.batchStats.total).toBe(2);
      expect(res.body.batchStats.completed).toBe(1);
    });
  });

  describe('POST /api/jobs/:id/cancel', () => {
    it('should cancel a queued or running job', async () => {
      prismaMock.jobs.findFirst.mockResolvedValue({
        id: 'j1',
        status: 'QUEUED',
        projectId: 'mock-proj-id',
        project: { organizationId: 'mock-org-id' },
      });
      prismaMock.jobs.update.mockResolvedValue({ id: 'j1', status: 'CANCELLED' });

      const res = await request(app)
        .post('/api/jobs/j1/cancel')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.job.status).toBe('CANCELLED');
    });
  });

  describe('DELETE /api/jobs/:id', () => {
    it('should soft-delete job', async () => {
      prismaMock.jobs.findFirst.mockResolvedValue({
        id: 'j1',
        projectId: 'mock-proj-id',
        project: { organizationId: 'mock-org-id' },
      });
      prismaMock.jobs.update.mockResolvedValue({ id: 'j1', isDeleted: true });

      const res = await request(app)
        .delete('/api/jobs/j1')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');
    });
  });

  describe('POST /api/jobs/:id/retry', () => {
    it('should manually retry a failed job', async () => {
      prismaMock.jobs.findFirst.mockResolvedValue({
        id: 'failed-job-id',
        status: 'FAILED',
        projectId: 'mock-proj-id',
        project: { organizationId: 'mock-org-id' },
      });
      prismaMock.jobs.update.mockResolvedValue({
        id: 'failed-job-id',
        status: 'QUEUED',
      });

      const res = await request(app)
        .post('/api/jobs/failed-job-id/retry')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.job.status).toBe('QUEUED');
    });
  });
});
