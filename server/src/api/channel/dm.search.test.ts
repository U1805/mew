import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcastToUser: vi.fn(),
    broadcast: vi.fn(),
  },
}));

import app from '../../app';

describe('Channel Search Routes: GET /api/channels/:channelId/search', () => {
  const userA = { email: 'dmsearch-a@example.com', username: 'dmsearcha', password: 'password123' };
  const userB = { email: 'dmsearch-b@example.com', username: 'dmsearchb', password: 'password123' };
  const userC = { email: 'dmsearch-c@example.com', username: 'dmsearchc', password: 'password123' };

  let tokenA = '';
  let tokenB = '';
  let tokenC = '';
  let recipientIdB = '';
  let dmChannelId = '';

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(userA);
    await request(app).post('/api/auth/register').send(userB);
    await request(app).post('/api/auth/register').send(userC);

    const loginA = await request(app).post('/api/auth/login').send({ email: userA.email, password: userA.password });
    tokenA = loginA.body.token;

    const loginB = await request(app).post('/api/auth/login').send({ email: userB.email, password: userB.password });
    tokenB = loginB.body.token;

    const loginC = await request(app).post('/api/auth/login').send({ email: userC.email, password: userC.password });
    tokenC = loginC.body.token;

    const meB = await request(app).get('/api/users/@me').set('Authorization', `Bearer ${tokenB}`);
    recipientIdB = meB.body._id;

    const dmRes = await request(app)
      .post('/api/users/@me/channels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ recipientId: recipientIdB });
    dmChannelId = dmRes.body._id;

    await request(app)
      .post(`/api/channels/${dmChannelId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'hello cats' });

    await request(app)
      .post(`/api/channels/${dmChannelId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'dogs only' });
  });

  it('should return 400 if search query `q` is missing', async () => {
    const res = await request(app)
      .get(`/api/channels/${dmChannelId}/search`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.statusCode).toBe(400);
  });

  it('should search only within this DM channel', async () => {
    const res = await request(app)
      .get(`/api/channels/${dmChannelId}/search?q=cats`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.messages).toBeInstanceOf(Array);
    expect(res.body.messages.length).toBe(1);
    expect(res.body.messages[0].content).toContain('cats');
    expect(res.body.messages[0].channelId).toBe(dmChannelId);
  });

  it('should allow the other recipient to search', async () => {
    const res = await request(app)
      .get(`/api/channels/${dmChannelId}/search?q=hello`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.messages.length).toBeGreaterThan(0);
  });

  it('should return 403 for non-recipients', async () => {
    const res = await request(app)
      .get(`/api/channels/${dmChannelId}/search?q=cats`)
      .set('Authorization', `Bearer ${tokenC}`);

    expect(res.statusCode).toBe(403);
  });

  it('supports searching in a server channel for server members', async () => {
    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'dmsearch-server' });
    const serverId = serverRes.body._id;

    const channelRes = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'general', type: 'GUILD_TEXT' });
    const guildChannelId = channelRes.body._id;

    await request(app)
      .post(`/api/servers/${serverId}/channels/${guildChannelId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'guild cats' });

    const res = await request(app)
      .get(`/api/channels/${guildChannelId}/search?q=cats`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.messages).toBeInstanceOf(Array);
    expect(res.body.messages.length).toBeGreaterThan(0);
    expect(res.body.messages[0].channelId).toBe(guildChannelId);
  });

  it('supports reading server channel messages via /api/channels/:channelId/messages for members', async () => {
    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'dmsearch-server-read' });
    const serverId = serverRes.body._id;

    const channelRes = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'general', type: 'GUILD_TEXT' });
    const guildChannelId = channelRes.body._id;

    await request(app)
      .post(`/api/servers/${serverId}/channels/${guildChannelId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'guild read test' });

    const res = await request(app)
      .get(`/api/channels/${guildChannelId}/messages?limit=5`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].channelId).toBe(guildChannelId);
  });

  it('blocks reading server channel messages via /api/channels/:channelId/messages for non-members', async () => {
    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'dmsearch-server-read-block' });
    const serverId = serverRes.body._id;

    const channelRes = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'general', type: 'GUILD_TEXT' });
    const guildChannelId = channelRes.body._id;

    const res = await request(app)
      .get(`/api/channels/${guildChannelId}/messages?limit=5`)
      .set('Authorization', `Bearer ${tokenC}`);

    expect(res.statusCode).toBe(403);
  });
});

