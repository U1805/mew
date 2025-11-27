import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { ChannelType } from '../../models/Channel';
import { createMessage } from './message.service';

describe('Message Routes', () => {
  const userData = {
    email: 'message-test@example.com',
    username: 'messagetest',
    password: 'password123',
  };
  let token = '';
  let userId = '';
  let channelId = '';
  let serverId = '';

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = loginRes.body.token;
    userId = loginRes.body.user._id;

    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Message Test Server' });
    serverId = serverRes.body._id;

    const channelRes = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'messages', type: ChannelType.GUILD_TEXT });
    channelId = channelRes.body._id;

    // Create some test messages
    for (let i = 0; i < 20; i++) {
      await createMessage({ channelId, authorId: userId, content: `Message ${i}` });
    }
  });

  describe('GET /api/channels/:channelId/messages', () => {
    it('should get the latest messages from a channel', async () => {
      const res = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(20);
      expect(res.body[0].content).toBe('Message 19');
    });

        it('should support limit parameter', async () => {
      const res = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages?limit=10`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(10);
    });

        it('should support before parameter for pagination', async () => {
      const firstRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages?limit=10`)
        .set('Authorization', `Bearer ${token}`)

      const lastMessageId = firstRes.body[9]._id;

      const secondRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages?limit=10&before=${lastMessageId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(secondRes.statusCode).toBe(200);
      expect(secondRes.body.length).toBe(10);
      expect(secondRes.body[0].content).toBe('Message 9');
    });
  });
});
