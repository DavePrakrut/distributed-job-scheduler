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
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    retryPolicies: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    jobs: {
      groupBy: jest.fn(),
      updateMany: jest.fn(),
    },
    scheduledJobs: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(prisma)),
  },
}));

const prismaMock = prisma as any;

const mockToken = TokenService.generateAccessToken({
  userId: 'mock-user-id',
  email: 'admin@acme.com',
  role: 'ADMIN',
  organizationId: 'mock-org-id',
});

describe('Queue APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/projects/:projectId/queues', () => {
    it('should create a queue and retry policy successfully', async () => {
      prismaMock.projects.findFirst.mockResolvedValue({ id: 'mock-proj-id' });
      prismaMock.queues.findFirst.mockResolvedValue(null);
      prismaMock.retryPolicies.create.mockResolvedValue({ id: 'mock-policy-id' });
      prismaMock.queues.create.mockResolvedValue({
        id: 'new-queue-id',
        name: 'email-queue',
        priority: 10,
        maxConcurrency: 5,
        projectId: 'mock-proj-id',
        retryPolicyId: 'mock-policy-id',
      });

      const res = await request(app)
        .post('/api/projects/mock-proj-id/queues')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          name: 'email-queue',
          priority: 10,
          maxConcurrency: 5,
          retryStrategy: 'EXPONENTIAL',
          maxRetries: 3,
          baseDelaySeconds: 5,
          factor: 2.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('email-queue');
      expect(res.body.retryPolicyId).toBe('mock-policy-id');
    });
  });

  describe('GET /api/projects/:projectId/queues', () => {
    it('should return queues list with stats', async () => {
      prismaMock.projects.findFirst.mockResolvedValue({ id: 'p1' });
      prismaMock.queues.findMany.mockResolvedValue([
        {
          id: 'q1',
          name: 'Queue 1',
          priority: 1,
          maxConcurrency: 5,
          isPaused: false,
          retryPolicyId: 'rp1',
        },
      ]);
      prismaMock.jobs.groupBy.mockResolvedValue([
        { queueId: 'q1', status: 'QUEUED', _count: { id: 10 } },
      ]);

      const res = await request(app)
        .get('/api/projects/p1/queues')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body[0].name).toBe('Queue 1');
      expect(res.body[0].stats.queued).toBe(10);
    });
  });

  describe('GET /api/queues/:id', () => {
    it('should return single queue details', async () => {
      prismaMock.queues.findFirst.mockResolvedValue({
        id: 'q1',
        name: 'Queue 1',
        projectId: 'p1',
        retryPolicy: { id: 'rp1', name: 'Policy 1' },
        project: { organizationId: 'mock-org-id' },
      });
      prismaMock.jobs.groupBy.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/queues/q1')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Queue 1');
    });
  });

  describe('PUT /api/queues/:id', () => {
    it('should update queue settings', async () => {
      prismaMock.queues.findFirst.mockResolvedValue({
        id: 'q1',
        projectId: 'p1',
        project: { organizationId: 'mock-org-id' },
      });
      prismaMock.queues.update.mockResolvedValue({
        id: 'q1',
        maxConcurrency: 10,
      });

      const res = await request(app)
        .put('/api/queues/q1')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ maxConcurrency: 10 });

      expect(res.status).toBe(200);
      expect(res.body.maxConcurrency).toBe(10);
    });
  });

  describe('DELETE /api/queues/:id', () => {
    it('should soft-delete queue', async () => {
      prismaMock.queues.findFirst.mockResolvedValue({
        id: 'q1',
        projectId: 'p1',
        project: { organizationId: 'mock-org-id' },
      });
      prismaMock.queues.update.mockResolvedValue({ id: 'q1', isDeleted: true });

      const res = await request(app)
        .delete('/api/queues/q1')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');
    });
  });

  describe('POST /api/queues/:id/pause', () => {
    it('should pause a queue successfully', async () => {
      prismaMock.queues.findFirst.mockResolvedValue({
        id: 'mock-queue-id',
        projectId: 'mock-proj-id',
        project: { organizationId: 'mock-org-id' },
      });
      prismaMock.queues.update.mockResolvedValue({
        id: 'mock-queue-id',
        name: 'email-queue',
        isPaused: true,
      });

      const res = await request(app)
        .post('/api/queues/mock-queue-id/pause')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isPaused).toBe(true);
    });
  });

  describe('POST /api/queues/:id/resume', () => {
    it('should resume a paused queue successfully', async () => {
      prismaMock.queues.findFirst.mockResolvedValue({
        id: 'mock-queue-id',
        projectId: 'mock-proj-id',
        project: { organizationId: 'mock-org-id' },
      });
      prismaMock.queues.update.mockResolvedValue({
        id: 'mock-queue-id',
        name: 'email-queue',
        isPaused: false,
      });

      const res = await request(app)
        .post('/api/queues/mock-queue-id/resume')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isPaused).toBe(false);
    });
  });
});
