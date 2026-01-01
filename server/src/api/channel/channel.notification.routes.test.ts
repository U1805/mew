import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcastToUser: vi.fn(),
    broadcast: vi.fn(),
  },
}));

import app from '../../app';

describe('Channel Notification Settings Routes', () => {
  const userData = {
    email: 'notif-channel@example.com',
    username: 'notifchannel',
    password: 'password123',
  };

  let token = '';
  let serverId = '';
  let channelId = '';

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = loginRes.body.token;

    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Notif Channel Server' });
    serverId = serverRes.body._id;

    const channelRes = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'general', type: 'GUILD_TEXT' });
    channelId = channelRes.body._id;
  });

  it('GET /api/channels/:channelId/notification-settings returns DEFAULT when unset', async () => {
    const res = await request(app)
      .get(`/api/channels/${channelId}/notification-settings`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ level: 'DEFAULT' });
  });

  it('PUT /api/channels/:channelId/notification-settings upserts and deletes with DEFAULT', async () => {
    const putRes = await request(app)
      .put(`/api/channels/${channelId}/notification-settings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ level: 'MUTE' });

    expect(putRes.statusCode).toBe(200);
    expect(putRes.body).toEqual({ level: 'MUTE' });

    const getRes = await request(app)
      .get(`/api/channels/${channelId}/notification-settings`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.statusCode).toBe(200);
    expect(getRes.body).toEqual({ level: 'MUTE' });

    const resetRes = await request(app)
      .put(`/api/channels/${channelId}/notification-settings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ level: 'DEFAULT' });

    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.body).toEqual({ level: 'DEFAULT' });

    const afterRes = await request(app)
      .get(`/api/channels/${channelId}/notification-settings`)
      .set('Authorization', `Bearer ${token}`);

    expect(afterRes.statusCode).toBe(200);
    expect(afterRes.body).toEqual({ level: 'DEFAULT' });
  });
});

