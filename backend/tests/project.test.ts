import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/db';
import { TokenService } from '../src/services/token.service';

jest.mock('../src/config/db', () => ({
  __esModule: true,
  default: {
    projects: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    queues: {
      updateMany: jest.fn(),
    },
    jobs: {
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

describe('Project APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/projects', () => {
    it('should create a project successfully for the organization', async () => {
      prismaMock.projects.findFirst.mockResolvedValue(null);
      prismaMock.projects.create.mockResolvedValue({
        id: 'new-proj-id',
        name: 'New Mobile App',
        organizationId: 'mock-org-id',
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ name: 'New Mobile App' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('New Mobile App');
    });

    it('should fail if project name is duplicate in the same organization', async () => {
      prismaMock.projects.findFirst.mockResolvedValue({ id: 'exists' });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ name: 'New Mobile App' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });
  });

  describe('GET /api/projects', () => {
    it('should list all projects in organization', async () => {
      prismaMock.projects.findMany.mockResolvedValue([
        { id: 'p1', name: 'Proj 1' },
        { id: 'p2', name: 'Proj 2' },
      ]);

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return project details', async () => {
      prismaMock.projects.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Proj 1',
        organizationId: 'mock-org-id',
      });

      const res = await request(app)
        .get('/api/projects/p1')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Proj 1');
    });

    it('should fail with 404 if project is not found', async () => {
      prismaMock.projects.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/projects/non-existent')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/projects/:id', () => {
    it('should update project name', async () => {
      prismaMock.projects.findFirst.mockResolvedValueOnce({
        id: 'p1',
        organizationId: 'mock-org-id',
      });
      prismaMock.projects.findFirst.mockResolvedValueOnce(null); // No name collision
      prismaMock.projects.update.mockResolvedValue({ id: 'p1', name: 'Updated name' });

      const res = await request(app)
        .put('/api/projects/p1')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ name: 'Updated name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated name');
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should soft-delete project and its queues/jobs/schedules', async () => {
      prismaMock.projects.findFirst.mockResolvedValue({ id: 'p1', organizationId: 'mock-org-id' });
      prismaMock.projects.update.mockResolvedValue({ id: 'p1', isDeleted: true });

      const res = await request(app)
        .delete('/api/projects/p1')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');
    });
  });
});
