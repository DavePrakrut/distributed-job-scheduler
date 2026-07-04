import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validate } from '../middleware/validation.middleware';

const router = Router();

// Validation Rules
const registerValidation = validate({
  body: [
    { field: 'organizationName', type: 'string', required: true },
    { field: 'email', type: 'email', required: true },
    { field: 'password', type: 'string', required: true },
  ],
});

const loginValidation = validate({
  body: [
    { field: 'email', type: 'email', required: true },
    { field: 'password', type: 'string', required: true },
  ],
});

const refreshValidation = validate({
  body: [{ field: 'refreshToken', type: 'string', required: true }],
});

// Routes
router.post('/register', registerValidation, AuthController.register);
router.post('/login', loginValidation, AuthController.login);
router.post('/refresh', refreshValidation, AuthController.refresh);

export default router;
