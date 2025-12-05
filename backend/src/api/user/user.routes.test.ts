import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Mock the socketManager to prevent errors in tests that indirectly trigger socket events
vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcastToUser: vi.fn(),
    broadcast: vi.fn(),
  },
}));
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
      expect(res.body.recipients.map((r: any) => r._id)).toContain(recipientId);
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

  describe('GET /api/users/search', () => {

    beforeEach(async () => {
      // Create a few more users for searching
      await request(app).post('/api/auth/register').send({ email: 'search1@example.com', username: 'search-user-1', password: 'password123' });
      await request(app).post('/api/auth/register').send({ email: 'search2@example.com', username: 'search-user-2', password: 'password123' });
      await request(app).post('/api/auth/register').send({ email: 'another@example.com', username: 'another-user', password: 'password123' });
    });

    it('should return 401 if no token is provided', async () => {
      const res = await request(app).get('/api/users/search?q=test');
      expect(res.statusCode).toBe(401);
    });

    it('should return users matching the search query', async () => {
      const res = await request(app)
        .get('/api/users/search?q=search')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(2);
      expect(res.body[0].username).toContain('search-user');
    });

    it('should not return the current user in search results', async () => {
        const res = await request(app)
        .get('/api/users/search?q=usertest') // usertest is the current user
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(0);
    });

    it('should return only selected fields (username, avatarUrl)', async () => {
      const res = await request(app)
        .get('/api/users/search?q=search')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      const user = res.body[0];
      expect(user).toHaveProperty('_id');
      expect(user).toHaveProperty('username');
      // avatarUrl is optional and may not exist if not set, so we don't assert its presence.
      // Instead, we focus on ensuring no sensitive fields are present.
      expect(user).not.toHaveProperty('email');
      expect(user).not.toHaveProperty('password');
    });

    it('should return an empty array if no users match', async () => {
      const res = await request(app)
        .get('/api/users/search?q=nonexistent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return an empty array if query is empty', async () => {
        const res = await request(app)
        .get('/api/users/search?q=')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/users/@me/channels', () => {
    let recipientId: string;
    let dmChannelId: string;

    beforeEach(async () => {
      const recipientData = { email: 'dm-recipient@example.com', username: 'dm_recipient', password: 'password123' };
      const recipientRes = await request(app).post('/api/auth/register').send(recipientData);
      recipientId = recipientRes.body.user._id;

      const dmChannelRes = await request(app)
        .post('/api/users/@me/channels')
        .set('Authorization', `Bearer ${token}`)
        .send({ recipientId });
      dmChannelId = dmChannelRes.body._id;
    });

    it('should return DM channels with lastMessage and lastReadMessageId', async () => {
      const messageRes = await request(app)
        .post(`/api/channels/${dmChannelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello DM' });
      const messageId = messageRes.body._id;

      const res = await request(app)
        .get('/api/users/@me/channels')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      const channel = res.body[0];
      expect(channel).toHaveProperty('lastMessage');
      expect(channel.lastMessage._id).toBe(messageId);
      expect(channel).toHaveProperty('lastReadMessageId');
      expect(channel.lastReadMessageId).toBe(null);
    });

    it('should show correct read status after acking', async () => {
      const messageRes = await request(app)
        .post(`/api/channels/${dmChannelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Another message' });
      const messageId = messageRes.body._id;

      await request(app)
        .post(`/api/channels/${dmChannelId}/ack`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lastMessageId: messageId });

      const res = await request(app)
        .get('/api/users/@me/channels')
        .set('Authorization', `Bearer ${token}`);

      const channel = res.body[0];
      expect(channel.lastMessage._id).toBe(messageId);
      expect(channel.lastReadMessageId).toBe(messageId);
    });

    it('should have null lastMessage if no messages sent', async () => {
      const res = await request(app)
        .get('/api/users/@me/channels')
        .set('Authorization', `Bearer ${token}`);

      const channel = res.body.find((c: any) => c._id === dmChannelId);
      expect(channel.lastMessage).toBe(null);
    });
  });
});
