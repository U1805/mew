import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('User Routes', () => {
  const userData = {
    email: 'user-test@example.com',
    username: 'usertest',
    password: 'password123',
  };
  let token = '';

  beforeEach(async () => {
    // Register and login before each test in this suite to get a fresh token
    await request(app).post('/api/auth/register').send(userData);
    const res = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = res.body.token;
  });

  describe('GET /api/users/@me', () => {
    it('should return 401 if no token is provided', async () => {
      const res = await request(app).get('/api/users/@me');
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 if token is invalid', async () => {
      const res = await request(app)
        .get('/api/users/@me')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.statusCode).toBe(401);
    });

    it('should return the current user if token is valid', async () => {
      const res = await request(app)
        .get('/api/users/@me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.email).toBe(userData.email);
    });
  });
});
