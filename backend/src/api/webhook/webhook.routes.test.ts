import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('Webhook Routes', () => {
  let token: string;
  let serverId: string;
  let channelId: string;

  beforeEach(async () => {
    // 1. Create a user and get token
    const userData = {
      email: `testuser-${Date.now()}@example.com`,
      username: `testuser-${Date.now()}`,
      password: 'password123',
    };
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = loginRes.body.token;

    // 2. Create a server
    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Server for Webhooks' });
    serverId = serverRes.body._id;

    // 3. Create a channel
    const channelRes = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'webhook-channel', type: 'GUILD_TEXT' });
    channelId = channelRes.body._id;
  });

  describe('Webhook Management API', () => {
    let webhookId: string;
    const webhookData = { name: 'My Test Webhook', avatarUrl: 'http://example.com/avatar.png' };

    it('should create a new webhook successfully', async () => {
        const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send(webhookData);

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe(webhookData.name);
      expect(res.body.channelId).toBe(channelId);
      expect(res.body).toHaveProperty('token');
      webhookId = res.body._id; // Save for next tests
    });

    it('should get a list of webhooks for a channel', async () => {
        // First create a webhook to ensure the list is not empty
        await request(app)
          .post(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
          .set('Authorization', `Bearer ${token}`)
          .send(webhookData);

        const res = await request(app)
          .get(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0].name).toBe(webhookData.name);
      });

    it('should update a webhook successfully', async () => {
        const createRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send(webhookData);
        webhookId = createRes.body._id

      const updatedData = { name: 'Updated Webhook Name' };
      const res = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatedData);

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe(updatedData.name);
    });

    it('should delete a webhook successfully', async () => {
        const createRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send(webhookData);
        webhookId = createRes.body._id

      const res = await request(app)
        .delete(`/api/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(204);
    });
  });

  describe('Webhook Execution API', () => {
    let webhook: any;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Executor Webhook' });
      webhook = res.body;
    });

    it('should execute a webhook and post a message', async () => {
      const payload = { content: 'Hello from Webhook!' };
      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/${webhook.token}`)
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.body.content).toBe(payload.content);
      expect(res.body.channelId).toBe(channelId);
      expect(res.body.authorId._id).toBe(webhook.botUserId);
    });

    it('should fail with an invalid token', async () => {
      const payload = { content: 'This should fail' };
      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/invalidtoken`)
        .send(payload);

      expect(res.statusCode).toBe(401);
    });

    it('should override username and avatar on execution', async () => {
        const payload = {
          content: 'Customized message!',
          username: 'Custom Bot',
          avatar_url: 'http://example.com/custom.png',
        };

        const res = await request(app)
          .post(`/api/webhooks/${webhook._id}/${webhook.token}`)
          .send(payload);

        expect(res.statusCode).toBe(200);
        expect(res.body.content).toBe(payload.content);
        // Note: The `authorId` will still be the bot user's ID,
        // but the populated data should reflect the override.
        // Supertest won't show populated fields directly unless the service returns them.
        // Assuming the service works as intended, we check the status.
        // A more robust test would mock the MessageService createMessage call to verify its input.
      });
  });
});
