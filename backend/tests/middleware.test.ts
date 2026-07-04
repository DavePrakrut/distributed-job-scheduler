import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { authenticate, requireRole, checkTenant } from '../src/middleware/auth.middleware';
import { errorHandler } from '../src/middleware/error.middleware';
import { validate } from '../src/middleware/validation.middleware';
import { TokenService } from '../src/services/token.service';

const mockAdminToken = TokenService.generateAccessToken({
  userId: 'u1',
  email: 'admin@test.com',
  role: 'ADMIN',
  organizationId: 'org-1',
});

const mockMemberToken = TokenService.generateAccessToken({
  userId: 'u2',
  email: 'member@test.com',
  role: 'MEMBER',
  organizationId: 'org-1',
});

describe('Middleware Tests', () => {
  describe('auth.middleware', () => {
    let app: express.Express;

    beforeAll(() => {
      app = express();
      app.use(express.json());

      app.get('/test-auth', authenticate as any, (req: any, res: Response) => {
        res.json({ user: req.user });
      });

      app.get(
        '/test-role',
        authenticate as any,
        requireRole(['ADMIN']) as any,
        (req: any, res: Response) => {
          res.json({ ok: true });
        },
      );

      app.post(
        '/test-tenant/:organizationId',
        authenticate as any,
        checkTenant('params', 'organizationId') as any,
        (req: any, res: Response) => {
          res.json({ ok: true });
        },
      );

      app.post(
        '/test-tenant-body',
        authenticate as any,
        checkTenant('body', 'organizationId') as any,
        (req: any, res: Response) => {
          res.json({ ok: true });
        },
      );

      app.use(errorHandler as any);
    });

    it('should block requests with missing authorization header', async () => {
      const res = await request(app).get('/test-auth');
      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid or expired');
    });

    it('should block requests with invalid Bearer token', async () => {
      const res = await request(app).get('/test-auth').set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
    });

    it('should allow authorized role', async () => {
      const res = await request(app)
        .get('/test-role')
        .set('Authorization', `Bearer ${mockAdminToken}`);
      expect(res.status).toBe(200);
    });

    it('should block unauthorized role with 403', async () => {
      const res = await request(app)
        .get('/test-role')
        .set('Authorization', `Bearer ${mockMemberToken}`);
      expect(res.status).toBe(403);
    });

    it('should allow matching tenant organization context', async () => {
      const res = await request(app)
        .post('/test-tenant/org-1')
        .set('Authorization', `Bearer ${mockAdminToken}`);
      expect(res.status).toBe(200);
    });

    it('should block mismatching tenant organization context', async () => {
      const res = await request(app)
        .post('/test-tenant/org-different')
        .set('Authorization', `Bearer ${mockAdminToken}`);
      expect(res.status).toBe(403);
    });

    it('should throw ForbiddenError if tenant context is missing from body source', async () => {
      const res = await request(app)
        .post('/test-tenant-body')
        .set('Authorization', `Bearer ${mockAdminToken}`)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Missing tenant scoping context');
    });
  });

  describe('validation.middleware', () => {
    let app: express.Express;

    beforeAll(() => {
      app = express();
      app.use(express.json());

      const testValidation = validate({
        body: [
          { field: 'name', type: 'string', required: true },
          { field: 'count', type: 'number', required: false },
        ],
      });

      app.post('/test-val', testValidation, (req: Request, res: Response) => {
        res.json({ ok: true });
      });

      app.use(errorHandler as any);
    });

    it('should block requests that fail body validation constraints', async () => {
      const res = await request(app).post('/test-val').send({ count: 'not-a-number' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("required field 'name'");
    });
  });
});
