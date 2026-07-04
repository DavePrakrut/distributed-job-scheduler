import { Router, RequestHandler } from 'express';
import { QueueController } from '../controllers/queue.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';

const router = Router();

// All queue routes require authentication
router.use(authenticate as RequestHandler);

// Validation Rules
const createQueueValidation = validate({
  params: [{ field: 'projectId', type: 'string', required: true }],
  body: [
    { field: 'name', type: 'string', required: true },
    { field: 'priority', type: 'number', required: false },
    { field: 'maxConcurrency', type: 'number', required: false },
    { field: 'retryPolicyId', type: 'string', required: false },
    { field: 'retryStrategy', type: 'string', required: false },
    { field: 'maxRetries', type: 'number', required: false },
    { field: 'baseDelaySeconds', type: 'number', required: false },
    { field: 'factor', type: 'number', required: false },
  ],
});

const listQueuesValidation = validate({
  params: [{ field: 'projectId', type: 'string', required: true }],
});

const getOrDeleteValidation = validate({
  params: [{ field: 'id', type: 'string', required: true }],
});

const updateQueueValidation = validate({
  params: [{ field: 'id', type: 'string', required: true }],
  body: [
    { field: 'name', type: 'string', required: false },
    { field: 'priority', type: 'number', required: false },
    { field: 'maxConcurrency', type: 'number', required: false },
    { field: 'retryPolicyId', type: 'string', required: false },
  ],
});

// Project-scoped routes
router.get(
  '/projects/:projectId/queues',
  listQueuesValidation,
  QueueController.list as unknown as RequestHandler,
);
router.post(
  '/projects/:projectId/queues',
  createQueueValidation,
  QueueController.create as unknown as RequestHandler,
);

// Queue direct routes
router.get('/queues/:id', getOrDeleteValidation, QueueController.get as unknown as RequestHandler);
router.put(
  '/queues/:id',
  updateQueueValidation,
  QueueController.update as unknown as RequestHandler,
);
router.delete(
  '/queues/:id',
  getOrDeleteValidation,
  QueueController.delete as unknown as RequestHandler,
);
router.post(
  '/queues/:id/pause',
  getOrDeleteValidation,
  QueueController.pause as unknown as RequestHandler,
);
router.post(
  '/queues/:id/resume',
  getOrDeleteValidation,
  QueueController.resume as unknown as RequestHandler,
);

export default router;
