import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('Server Routes', () => {
  const userData = {
    email: 'server-test@example.com',
    username: 'servertest',
    password: 'password123',
  };
  let token = '';
  let userId = '';

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(userData);
    const res = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = res.body.token;
    userId = res.body.user._id;
  });

  describe('POST /api/servers', () => {
    const serverData = { name: 'My Test Server' };

    it('should return 401 if no token is provided', async () => {
      const res = await request(app).post('/api/servers').send(serverData);
      expect(res.statusCode).toBe(401);
    });

    it('should create a new server successfully with a valid token', async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send(serverData);

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe(serverData.name);
      expect(res.body.ownerId).toBe(userId);
    });

    it('should return 400 for invalid server data', async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' }); // Invalid name

      expect(res.statusCode).toBe(400);
    });
  });
});
