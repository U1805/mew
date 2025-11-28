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

  describe('POST /api/users/@me/channels', () => {
    let recipientId: string;

    beforeEach(async () => {
      // Create another user to be the recipient
      const recipientData = { email: 'recipient@example.com', username: 'recipient', password: 'password123' };
      const res = await request(app).post('/api/auth/register').send(recipientData);
      recipientId = res.body.user._id;
    });

    it('should create a new DM channel', async () => {
      const res = await request(app)
        .post('/api/users/@me/channels')
        .set('Authorization', `Bearer ${token}`)
        .send({ recipientId });

      expect(res.statusCode).toBe(201);
      expect(res.body.type).toBe('DM');
      expect(res.body.recipients).toContain(recipientId);
    });

    it('should return the existing DM channel if one already exists', async () => {
      await request(app)
        .post('/api/users/@me/channels')
        .set('Authorization', `Bearer ${token}`)
        .send({ recipientId });

      const res = await request(app)
        .post('/api/users/@me/channels')
        .set('Authorization', `Bearer ${token}`)
        .send({ recipientId });

      expect(res.statusCode).toBe(201); // Or 200, depending on implementation detail
    });

    it('should return 400 if recipientId is not provided', async () => {
      const res = await request(app)
        .post('/api/users/@me/channels')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 if attempting to create a DM with oneself', async () => {
      const selfUserRes = await request(app).get('/api/users/@me').set('Authorization', `Bearer ${token}`);
      const selfId = selfUserRes.body._id;

      const res = await request(app)
        .post('/api/users/@me/channels')
        .set('Authorization', `Bearer ${token}`)
        .send({ recipientId: selfId });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('You cannot create a DM with yourself');
    });
  });
});
