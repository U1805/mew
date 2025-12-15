import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';
import path from 'path';

// Mock the socketManager to prevent errors in tests
vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcastToUser: vi.fn(),
  },
}));

describe('Bot Routes (/@me/bots)', () => {
  let token = '';
  let userId = '';
  let tokenUser2 = '';

  const user1Data = {
    email: 'bot-owner-1@example.com',
    username: 'bot-owner-1',
    password: 'password123',
  };

  const user2Data = {
    email: 'bot-owner-2@example.com',
    username: 'bot-owner-2',
    password: 'password123',
  };

  beforeEach(async () => {
    // Register and login user 1
    const regRes1 = await request(app).post('/api/auth/register').send(user1Data);
    userId = regRes1.body.user._id;
    const loginRes1 = await request(app).post('/api/auth/login').send({ email: user1Data.email, password: user1Data.password });
    token = loginRes1.body.token;

    // Register and login user 2
    await request(app).post('/api/auth/register').send(user2Data);
    const loginRes2 = await request(app).post('/api/auth/login').send({ email: user2Data.email, password: user2Data.password });
    tokenUser2 = loginRes2.body.token;
  });

  describe('POST /api/users/@me/bots', () => {
    it('should create a new bot without an avatar', async () => {
      const res = await request(app)
        .post('/api/users/@me/bots')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'MyTestBot' });

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('MyTestBot');
      expect(res.body.ownerId).toBe(userId);
      expect(res.body).not.toHaveProperty('accessToken');
    });

    it('should create a new bot with an avatar', async () => {
      const res = await request(app)
        .post('/api/users/@me/bots')
        .set('Authorization', `Bearer ${token}`)
        .field('name', 'MyBotWithAvatar')
        .attach('avatar', Buffer.from('fakeimagedata'), 'test-avatar.png');

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('MyBotWithAvatar');
      expect(res.body.avatarUrl).toBeDefined();
      expect(res.body.avatarUrl).toContain('.png');
    });

    it('should return 400 for invalid data (e.g., name too short)', async () => {
      const res = await request(app)
        .post('/api/users/@me/bots')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'a' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/users/@me/bots', () => {
    beforeEach(async () => {
      // Create a bot for the user
      await request(app).post('/api/users/@me/bots').set('Authorization', `Bearer ${token}`).send({ name: 'Bot1' });
      await request(app).post('/api/users/@me/bots').set('Authorization', `Bearer ${token}`).send({ name: 'Bot2' });
    });

    it('should return a list of bots owned by the user', async () => {
      const res = await request(app)
        .get('/api/users/@me/bots')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(2);
      expect(res.body[0].name).toBe('Bot1');
    });

    it('should return an empty array if the user owns no bots', async () => {
      const res = await request(app)
        .get('/api/users/@me/bots')
        .set('Authorization', `Bearer ${tokenUser2}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('Bot specific routes: /api/users/@me/bots/:botId', () => {
    let botId = '';

    beforeEach(async () => {
      const createRes = await request(app).post('/api/users/@me/bots').set('Authorization', `Bearer ${token}`).send({ name: 'SpecificBot' });
      botId = createRes.body._id;
    });

    // GET single
    it('should get a specific bot by ID', async () => {
      const res = await request(app)
        .get(`/api/users/@me/bots/${botId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('SpecificBot');
    });

    it('should return 404 when trying to get a bot owned by another user', async () => {
      const res = await request(app)
        .get(`/api/users/@me/bots/${botId}`)
        .set('Authorization', `Bearer ${tokenUser2}`);

      expect(res.statusCode).toBe(404);
    });

    // PATCH
    it('should update a bot', async () => {
      const res = await request(app)
        .patch(`/api/users/@me/bots/${botId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'UpdatedBotName', dmEnabled: true });

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('UpdatedBotName');
      expect(res.body.dmEnabled).toBe(true);
    });

    it('should return 404 when trying to update a bot owned by another user', async () => {
        const res = await request(app)
          .patch(`/api/users/@me/bots/${botId}`)
          .set('Authorization', `Bearer ${tokenUser2}`)
          .send({ name: 'MaliciousUpdate' });

        expect(res.statusCode).toBe(404);
      });

    // DELETE
    it('should delete a bot', async () => {
      const res = await request(app)
        .delete(`/api/users/@me/bots/${botId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(204);

      const getRes = await request(app)
        .get(`/api/users/@me/bots/${botId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.statusCode).toBe(404);
    });

    it('should return 404 when trying to delete a bot owned by another user', async () => {
        const res = await request(app)
          .delete(`/api/users/@me/bots/${botId}`)
          .set('Authorization', `Bearer ${tokenUser2}`);

        expect(res.statusCode).toBe(404);
      });

    // POST token regeneration
    it('should regenerate an access token', async () => {
      const res = await request(app)
        .post(`/api/users/@me/bots/${botId}/token`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.accessToken).toBeTypeOf('string');
      expect(res.body.accessToken.length).toBe(32);
    });

    it('should return 404 when trying to regenerate token for another user\'s bot', async () => {
        const res = await request(app)
          .post(`/api/users/@me/bots/${botId}/token`)
          .set('Authorization', `Bearer ${tokenUser2}`);

        expect(res.statusCode).toBe(404);
      });
  });
});
