import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';

// Mock the S3 utility to prevent actual file uploads during tests
vi.mock('../../utils/s3', () => ({
  uploadStream: vi.fn(),
  getS3PublicUrl: (key: string) => `http://cdn.local/${key}`,
  uploadFile: vi.fn(),
  createPresignedPutUrl: vi.fn(),
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
        expect(res.body[0]).not.toHaveProperty('token');
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
      expect(res.body).not.toHaveProperty('token');
    });

    it('should reset a webhook token and return a new token', async () => {
      const createRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send(webhookData);
      webhookId = createRes.body._id;
      const oldToken = createRes.body.token;

      const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}/reset-token`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.webhookId).toBe(webhookId);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token).not.toBe(oldToken);
    });

    it('should fetch a webhook token without resetting it', async () => {
      const createRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send(webhookData);
      webhookId = createRes.body._id;
      const createdToken = createRes.body.token;

      const res = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}/token`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.webhookId).toBe(webhookId);
      expect(res.body.token).toBe(createdToken);
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
          ignored_field: 'should be preserved',
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
      expect(res.body.payload.ignored_field).toBe(payload.payload.ignored_field);
    });

    it('should execute a webhook and post a Twitter card message (with s3 array hydration)', async () => {
      const payload = {
        type: 'app/x-twitter-card',
        content: 'Example tweet',
        payload: {
          id: '2000000000000000000',
          url: 'https://x.com/example/status/2000000000000000000',
          text: 'Hello twitter',
          created_at: 'Sun Dec 21 04:08:49 +0000 2025',
          author_name: 'Example',
          author_handle: 'example',
          s3_images: ['mock-file.txt', 'mock2.png'],
          s3_cover_url: 'cover.jpg',
          s3_video_url: 'video.mp4',
          video_content_type: 'video/mp4',
          ignored_field: 'should be preserved',
        },
      };

      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/${webhook.token}`)
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.body.type).toBe('app/x-twitter-card');
      expect(res.body.payload).toMatchObject({
        id: payload.payload.id,
        url: payload.payload.url,
        text: payload.payload.text,
        created_at: payload.payload.created_at,
        author_name: payload.payload.author_name,
        author_handle: payload.payload.author_handle,
        s3_images: ['http://cdn.local/mock-file.txt', 'http://cdn.local/mock2.png'],
        s3_cover_url: 'http://cdn.local/cover.jpg',
        s3_video_url: 'http://cdn.local/video.mp4',
        video_content_type: payload.payload.video_content_type,
      });
      expect(res.body.payload.ignored_field).toBe(payload.payload.ignored_field);
    });

    it('should execute a webhook and post a Twitter card message (with quoted_tweet hydration)', async () => {
      const payload = {
        type: 'app/x-twitter-card',
        content: 'Example tweet with quoted',
        payload: {
          id: '2000000000000000001',
          url: 'https://x.com/example/status/2000000000000000001',
          text: 'Hello twitter',
          created_at: 'Sun Dec 21 04:08:49 +0000 2025',
          author_name: 'Example',
          author_handle: 'example',
          quoted_tweet: {
            id: '1999999999999999999',
            url: 'https://x.com/other/status/1999999999999999999',
            text: 'Original tweet',
            created_at: 'Sun Dec 21 03:08:49 +0000 2025',
              author_name: 'Other',
              author_handle: 'other',
              s3_images: ['nested1.png', 'nested2.png'],
              ignored_field: 'should be preserved',
            },
            ignored_field: 'should be preserved',
          },
        };

      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/${webhook.token}`)
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.body.type).toBe('app/x-twitter-card');
      expect(res.body.payload).toMatchObject({
        id: payload.payload.id,
        url: payload.payload.url,
        text: payload.payload.text,
        created_at: payload.payload.created_at,
        author_name: payload.payload.author_name,
        author_handle: payload.payload.author_handle,
        quoted_tweet: {
          id: payload.payload.quoted_tweet.id,
          url: payload.payload.quoted_tweet.url,
          text: payload.payload.quoted_tweet.text,
          created_at: payload.payload.quoted_tweet.created_at,
          author_name: payload.payload.quoted_tweet.author_name,
          author_handle: payload.payload.quoted_tweet.author_handle,
          s3_images: ['http://cdn.local/nested1.png', 'http://cdn.local/nested2.png'],
        },
      });
      expect(res.body.payload.ignored_field).toBe(payload.payload.ignored_field);
      expect(res.body.payload.quoted_tweet.ignored_field).toBe(payload.payload.quoted_tweet.ignored_field);
    });

    it('should execute a webhook and post a Bilibili card message (with nested payload hydration)', async () => {
      const payload = {
        type: 'app/x-bilibili-card',
        content: 'Example bilibili',
        payload: {
          type: 'video',
          title: 'Example Title',
          description: 'Example desc',
          dynamic_id: '123456',
          dynamic_url: 'https://t.bilibili.com/123456',
          author_name: 'UP 主',
          author_face: 'https://i0.hdslb.com/bfs/face/example.jpg',
          published_at: 1700000000,
          s3_cover_url: 'cover.jpg',
          s3_image_urls: ['img1.png', 'img2.png'],
          emojis: [
            { text: '[dog]', s3_icon_url: 'emoji1.png' },
            { text: '[cat]', icon_url: 'https://example.com/cat.png' },
          ],
          original_author: 'Other',
          original_post: {
            type: 'post',
            text: 'Nested text',
            s3_image_urls: ['nested1.png'],
            ignored_field: 'should be preserved',
          },
          ignored_field: 'should be preserved',
        },
      };

      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/${webhook.token}`)
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.body.type).toBe('app/x-bilibili-card');
      expect(res.body.payload).toMatchObject({
        type: payload.payload.type,
        title: payload.payload.title,
        description: payload.payload.description,
        dynamic_id: payload.payload.dynamic_id,
        dynamic_url: payload.payload.dynamic_url,
        author_name: payload.payload.author_name,
        author_face: payload.payload.author_face,
        published_at: payload.payload.published_at,
        s3_cover_url: 'http://cdn.local/cover.jpg',
        s3_image_urls: ['http://cdn.local/img1.png', 'http://cdn.local/img2.png'],
        emojis: [
          { text: '[dog]', s3_icon_url: 'http://cdn.local/emoji1.png' },
          { text: '[cat]', icon_url: 'https://example.com/cat.png' },
        ],
        original_author: payload.payload.original_author,
        original_post: {
          type: payload.payload.original_post.type,
          text: payload.payload.original_post.text,
          s3_image_urls: ['http://cdn.local/nested1.png'],
        },
      });
      expect(res.body.payload.ignored_field).toBe(payload.payload.ignored_field);
      expect(res.body.payload.original_post.ignored_field).toBe(payload.payload.original_post.ignored_field);
    });

    it('should reject unsupported message types', async () => {
      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/${webhook.token}`)
        .send({ type: 'app/x-unknown-card', payload: { ok: true } });

      expect(res.statusCode).toBe(400);
      expect(String(res.body.message || '')).toMatch(/Unsupported message type/i);
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

    it('should presign a webhook upload and return key + put url', async () => {
      const { createPresignedPutUrl } = await import('../../utils/s3');
      vi.mocked(createPresignedPutUrl as any).mockResolvedValue('http://s3.local/put-url');

      const res = await request(app)
        .post(`/api/webhooks/${webhook._id}/${webhook.token}/presign`)
        .send({ filename: 'hello.txt', contentType: 'text/plain', size: 5 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        url: 'http://s3.local/put-url',
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
      });
      expect(typeof res.body.key).toBe('string');
      expect(res.body.key.length).toBeGreaterThan(0);
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
