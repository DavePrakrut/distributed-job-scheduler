import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/db';
import bcrypt from 'bcryptjs';

jest.mock('../src/config/db', () => ({
  __esModule: true,
  default: {
    organizations: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    users: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(prisma)),
  },
}));

const prismaMock = prisma as any;

describe('Authentication APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new organization and admin account successfully', async () => {
      prismaMock.users.findUnique.mockResolvedValue(null);
      prismaMock.organizations.create.mockResolvedValue({
        id: 'mock-org-id',
        name: 'Acme Test Corp',
      });
      prismaMock.users.create.mockResolvedValue({
        id: 'mock-user-id',
        email: 'admin@acme.com',
        role: 'ADMIN',
        organizationId: 'mock-org-id',
      });

      const res = await request(app).post('/api/auth/register').send({
        organizationName: 'Acme Test Corp',
        email: 'admin@acme.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe('admin@acme.com');
    });

    it('should fail registration if email is already taken', async () => {
      prismaMock.users.findUnique.mockResolvedValue({ id: 'existing-id' });

      const res = await request(app).post('/api/auth/register').send({
        organizationName: 'Acme Test Corp',
        email: 'admin@acme.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should authenticate user and return tokens', async () => {
      const mockHash = await bcrypt.hash('Password123!', 10);
      prismaMock.users.findUnique.mockResolvedValue({
        id: 'mock-user-id',
        email: 'admin@acme.com',
        passwordHash: mockHash,
        role: 'ADMIN',
        organizationId: 'mock-org-id',
        organization: {
          id: 'mock-org-id',
          name: 'Acme Test Corp',
        },
      });
      prismaMock.organizations.findFirst.mockResolvedValue({
        id: 'mock-org-id',
        name: 'Acme Test Corp',
      });

      const res = await request(app).post('/api/auth/login').send({
        email: 'admin@acme.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user.email).toBe('admin@acme.com');
    });

    it('should reject invalid credentials', async () => {
      prismaMock.users.findUnique.mockResolvedValue(null);

      const res = await request(app).post('/api/auth/login').send({
        email: 'admin@acme.com',
        password: 'WrongPassword!',
      });

      expect(res.status).toBe(401);
    });
  });
});
