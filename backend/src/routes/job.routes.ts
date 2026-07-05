import { Router, RequestHandler } from 'express';
import { JobController } from '../controllers/job.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';

const router = Router();

// All job routes require token authentication
router.use(authenticate as RequestHandler);

// Validation Rules
const createJobValidation = validate({
  params: [{ field: 'projectId', type: 'string', required: true }],
  body: [
    { field: 'name', type: 'string', required: true },
    { field: 'queueId', type: 'string', required: true },
    { field: 'runAt', type: 'string', required: false },
    { field: 'maxRetries', type: 'number', required: false },
  ],
});

const createScheduleValidation = validate({
  params: [{ field: 'projectId', type: 'string', required: true }],
  body: [
    { field: 'name', type: 'string', required: true },
    { field: 'queueId', type: 'string', required: true },
    { field: 'cronExpression', type: 'string', required: true },
  ],
});

const createBatchValidation = validate({
  params: [{ field: 'projectId', type: 'string', required: true }],
  body: [{ field: 'name', type: 'string', required: true }],
});

const listJobsValidation = validate({
  params: [{ field: 'projectId', type: 'string', required: true }],
  query: [
    { field: 'page', type: 'number', required: false },
    { field: 'limit', type: 'number', required: false },
    { field: 'status', type: 'string', required: false },
    { field: 'queueId', type: 'string', required: false },
    { field: 'batchId', type: 'string', required: false },
    { field: 'search', type: 'string', required: false },
    { field: 'sortBy', type: 'string', required: false },
    { field: 'sortOrder', type: 'string', required: false },
  ],
});

const getOrDirectActionValidation = validate({
  params: [{ field: 'id', type: 'string', required: true }],
});

// Project-scoped routes
router.get(
  '/projects/:projectId/jobs',
  listJobsValidation,
  JobController.list as unknown as RequestHandler,
);
router.post(
  '/projects/:projectId/jobs',
  createJobValidation,
  JobController.create as unknown as RequestHandler,
);
router.post(
  '/projects/:projectId/schedules',
  createScheduleValidation,
  JobController.createSchedule as unknown as RequestHandler,
);
router.post(
  '/projects/:projectId/batches',
  createBatchValidation,
  JobController.createBatch as unknown as RequestHandler,
);

// Job direct routes
router.get(
  '/jobs/:id',
  getOrDirectActionValidation,
  JobController.get as unknown as RequestHandler,
);
router.post(
  '/jobs/:id/retry',
  getOrDirectActionValidation,
  JobController.retry as unknown as RequestHandler,
);
router.post(
  '/jobs/:id/cancel',
  getOrDirectActionValidation,
  JobController.cancel as unknown as RequestHandler,
);
router.delete(
  '/jobs/:id',
  getOrDirectActionValidation,
  JobController.delete as unknown as RequestHandler,
);

export default router;
