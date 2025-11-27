import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app';

const userData = {
  email: 'integration@example.com',
  username: 'integrationuser',
  password: 'password123',
};

describe('Auth Routes', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app).post('/api/auth/register').send(userData);
      expect(res.statusCode).toBe(201);
      expect(res.body.user.email).toBe(userData.email);
    });

    it('should return 409 if email is already taken', async () => {
      await request(app).post('/api/auth/register').send(userData); // First time
      const res = await request(app).post('/api/auth/register').send(userData); // Second time
      expect(res.statusCode).toBe(409);
      expect(res.body.message).toContain('already exists');
    });

    it('should return 400 for invalid data', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'invalid' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should log in an existing user successfully', async () => {
      await request(app).post('/api/auth/register').send(userData);
      const res = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });

      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('should return 401 for incorrect password', async () => {
      await request(app).post('/api/auth/register').send(userData);
      const res = await request(app).post('/api/auth/login').send({ email: userData.email, password: 'wrongpassword' });

      expect(res.statusCode).toBe(401);
    });
  });
});
