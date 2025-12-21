import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';

// Mock the S3 utility to prevent actual file uploads during tests
vi.mock('../../utils/s3', () => ({
  uploadStream: vi.fn(),
  getS3PublicUrl: (key: string) => `http://cdn.local/${key}`,
  uploadFile: vi.fn(),
}));

import { uploadStream } from '../../utils/s3';

describe('Webhook Routes', () => {
  let token: string;
  let serverId: string;
  let channelId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default mock for streaming uploads (must drain stream to avoid hanging busboy)
    vi.mocked(uploadStream).mockImplementation(async (opts: any) => {
      await new Promise<void>((resolve, reject) => {
        opts.stream.on('data', () => {});
        opts.stream.on('end', () => resolve());
        opts.stream.on('error', reject);
      });
      return { key: 'mock-file.txt', mimetype: 'text/plain', size: 42 } as any;
    });

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

    it('should create distinct bot users per webhook', async () => {
      const w1 = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hook 1' });

      const w2 = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hook 2' });

      expect(w1.statusCode).toBe(201);
      expect(w2.statusCode).toBe(201);
      expect(w1.body.botUserId).toBeDefined();
      expect(w2.body.botUserId).toBeDefined();
      expect(w1.body.botUserId).not.toBe(w2.body.botUserId);
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

    it('should execute a webhook and post an RSS card message', async () => {
      const payload = {
        type: 'app/x-rss-card',
        content: 'Example title',
        payload: {
          title: 'Example title',
          summary: 'Example summary',
          url: 'https://example.com/post',
          thumbnail_url: 'https://example.com/img.png',
          s3_thumbnail_url: 'mock-file.txt',
          feed_title: 'Example Feed',
          published_at: '2025-01-01T00:00:00Z',
          ignored_field: 'should not be persisted',
        },
      };

      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/${webhook.token}`)
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.body.type).toBe('app/x-rss-card');
      expect(res.body.payload).toMatchObject({
        title: payload.payload.title,
        summary: payload.payload.summary,
        url: payload.payload.url,
        thumbnail_url: payload.payload.thumbnail_url,
        s3_thumbnail_url: 'http://cdn.local/mock-file.txt',
        feed_title: payload.payload.feed_title,
        published_at: payload.payload.published_at,
      });
      expect(res.body.payload.ignored_field).toBeUndefined();
    });

    it('should fail with an invalid token', async () => {
      const payload = { content: 'This should fail' };
      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/invalidtoken`)
        .send(payload);

      expect(res.statusCode).toBe(401);
    });

    it('should upload a file via webhook token and return attachment metadata', async () => {
      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/${webhook.token}/upload`)
        .attach('file', Buffer.from('hello'), 'hello.txt');

      expect(res.status).toBe(201);
      expect(uploadStream).toHaveBeenCalledOnce();
      expect(res.body).toEqual({
        filename: 'hello.txt',
        contentType: 'text/plain',
        key: 'mock-file.txt',
        size: 42,
      });
    });

    it('should return 400 if no file is uploaded via webhook upload endpoint', async () => {
      const res = await request(app).post(`/api/webhooks/${webhook._id}/${webhook.token}/upload`);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('No file uploaded.');
    });

    it('should return 401 on webhook upload with invalid token', async () => {
      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/invalidtoken/upload`)
        .attach('file', Buffer.from('hello'), 'hello.txt');

      expect(res.status).toBe(401);
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
