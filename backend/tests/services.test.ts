import prisma from '../src/config/db';
import { RetryService } from '../src/services/retry.service';
import { SchedulerService } from '../src/scheduler/scheduler';
import { WorkerService } from '../src/worker/worker';
import { RetryStrategy, JobStatus, WorkerStatus } from '@prisma/client';

jest.mock('../src/config/db', () => ({
  __esModule: true,
  default: {
    jobs: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    scheduledJobs: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    queues: {
      findFirst: jest.fn(),
    },
    deadLetterQueue: {
      create: jest.fn(),
    },
    workers: {
      create: jest.fn(),
      update: jest.fn(),
    },
    workerHeartbeats: {
      create: jest.fn(),
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
    $queryRawUnsafe: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

const prismaMock = prisma as any;

describe('Core Services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RetryService backoff calculations', () => {
    const fixedPolicy = {
      id: 'p1',
      name: 'Fixed 5s',
      strategy: RetryStrategy.FIXED,
      maxRetries: 3,
      baseDelaySeconds: 5,
      factor: 2.0,
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const linearPolicy = {
      ...fixedPolicy,
      strategy: RetryStrategy.LINEAR,
    };

    const exponentialPolicy = {
      ...fixedPolicy,
      strategy: RetryStrategy.EXPONENTIAL,
    };

    it('should calculate FIXED backoff correctly', () => {
      expect(RetryService.calculateDelay(fixedPolicy, 1)).toBe(5);
      expect(RetryService.calculateDelay(fixedPolicy, 3)).toBe(5);
    });

    it('should calculate LINEAR backoff correctly', () => {
      expect(RetryService.calculateDelay(linearPolicy, 1)).toBe(5);
      expect(RetryService.calculateDelay(linearPolicy, 2)).toBe(10);
      expect(RetryService.calculateDelay(linearPolicy, 3)).toBe(15);
    });

    it('should calculate EXPONENTIAL backoff correctly', () => {
      expect(RetryService.calculateDelay(exponentialPolicy, 1)).toBe(5);
      expect(RetryService.calculateDelay(exponentialPolicy, 2)).toBe(10);
      expect(RetryService.calculateDelay(exponentialPolicy, 3)).toBe(20);
    });
  });

  describe('SchedulerService recovery and promotion', () => {
    let scheduler: SchedulerService;

    beforeEach(() => {
      scheduler = new SchedulerService();
    });

    it('should promote ready delayed jobs from SCHEDULED to QUEUED', async () => {
      prismaMock.jobs.updateMany.mockResolvedValue({ count: 2 });
      prismaMock.scheduledJobs.findMany.mockResolvedValue([]);

      // Invoke the private sweep method
      await (scheduler as any).sweep();

      expect(prismaMock.jobs.updateMany).toHaveBeenCalledWith({
        where: {
          status: JobStatus.SCHEDULED,
          runAt: { lte: expect.any(Date) },
          isDeleted: false,
        },
        data: {
          status: JobStatus.QUEUED,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should promote scheduled cron templates', async () => {
      prismaMock.jobs.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.scheduledJobs.findMany.mockResolvedValue([
        {
          id: 'sched-1',
          name: 'cron-job',
          cronExpression: '*/5 * * * *',
          nextRunAt: new Date(Date.now() - 10000),
          projectId: 'p1',
          queueId: 'q1',
          payload: { timezone: 'UTC' },
        },
      ]);
      prismaMock.scheduledJobs.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.jobs.create.mockResolvedValue({ id: 'j-1' });

      await (scheduler as any).sweep();

      expect(prismaMock.jobs.create).toHaveBeenCalled();
      expect(prismaMock.scheduledJobs.updateMany).toHaveBeenCalled();
    });
  });

  describe('WorkerService claiming and completion', () => {
    let worker: WorkerService;

    beforeEach(() => {
      worker = new WorkerService('test-worker-node', 2);
    });

    it('should register worker on start', async () => {
      prismaMock.workers.create.mockResolvedValue({ id: 'worker-id-123' });

      // Inject internal method testing
      await (worker as any).register();

      expect(prismaMock.workers.create).toHaveBeenCalledWith({
        data: {
          name: 'test-worker-node',
          hostName: expect.any(String),
          status: WorkerStatus.ACTIVE,
          concurrencyLimit: 2,
          activeJobsCount: 0,
        },
      });
    });

    it('should route permanently failed jobs to DeadLetterQueue', async () => {
      const mockJob = {
        id: 'job-1',
        name: 'test-job',
        payload: {},
        status: JobStatus.RUNNING,
        runAt: new Date(),
        queueId: 'q1',
        projectId: 'p1',
        maxRetries: 3,
        currentRetryCount: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.queues.findFirst.mockResolvedValue({
        id: 'q1',
        retryPolicy: null,
      });
      prismaMock.jobs.update.mockResolvedValue({ id: 'job-1', status: JobStatus.FAILED });

      await (worker as any).handleJobCompletion(
        mockJob,
        'FAILED',
        'Fatal error',
        'Stacktrace details',
        null,
      );

      expect(prismaMock.deadLetterQueue.create).toHaveBeenCalledWith({
        data: {
          jobId: 'job-1',
          queueId: 'q1',
          reason: 'Fatal error',
          stackTrace: 'Stacktrace details',
          originalPayload: {},
        },
      });
    });
  });
});
