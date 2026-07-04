import request from 'supertest';
import app from '../src/app';

describe('App General APIs', () => {
  describe('GET /health', () => {
    it('should return 200 OK with status and timestamp', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('POST /api/internal/broadcast', () => {
    it('should accept broadcast requests and relay them to clients', async () => {
      const res = await request(app)
        .post('/api/internal/broadcast')
        .send({
          projectId: 'mock-proj-id',
          organizationId: 'mock-org-id',
          event: { type: 'TEST_EVENT', payload: { message: 'hello' } },
        });

      expect(res.status).toBe(200);
    });

    it('should support organization broadcast events', async () => {
      const res = await request(app)
        .post('/api/internal/broadcast')
        .send({
          organizationId: 'mock-org-id',
          event: { type: 'TEST_EVENT_2', payload: { message: 'hi' } },
        });

      expect(res.status).toBe(200);
    });
  });
});
