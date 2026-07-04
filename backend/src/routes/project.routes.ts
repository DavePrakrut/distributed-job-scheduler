import { Router, RequestHandler } from 'express';
import { ProjectController } from '../controllers/project.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';

const router = Router();

// All project routes require authentication
router.use(authenticate as RequestHandler);

// Validation Rules
const createProjectValidation = validate({
  body: [{ field: 'name', type: 'string', required: true }],
});

const updateProjectValidation = validate({
  params: [{ field: 'id', type: 'string', required: true }],
  body: [{ field: 'name', type: 'string', required: true }],
});

const getOrDeleteValidation = validate({
  params: [{ field: 'id', type: 'string', required: true }],
});

// Route mapping
router.get('/', ProjectController.list as unknown as RequestHandler);
router.get('/:id', getOrDeleteValidation, ProjectController.get as unknown as RequestHandler);
router.post('/', createProjectValidation, ProjectController.create as unknown as RequestHandler);
router.put('/:id', updateProjectValidation, ProjectController.update as unknown as RequestHandler);
router.delete('/:id', getOrDeleteValidation, ProjectController.delete as unknown as RequestHandler);

export default router;
