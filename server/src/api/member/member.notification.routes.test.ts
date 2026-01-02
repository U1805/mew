import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcastToUser: vi.fn(),
    broadcast: vi.fn(),
  },
}));

import app from '../../app';

describe('Member Notification Settings Routes', () => {
  const userData = {
    email: 'notif-member@example.com',
    username: 'notifmember',
    password: 'password123',
  };

  let token = '';
  let serverId = '';

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = loginRes.body.token;

    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Notif Server' });
    serverId = serverRes.body._id;
  });

  it('GET /api/servers/:serverId/members/@me/notification-settings returns defaults', async () => {
    const res = await request(app)
      .get(`/api/servers/${serverId}/members/@me/notification-settings`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ notificationLevel: 'ALL_MESSAGES' });
  });

  it('PUT /api/servers/:serverId/members/@me/notification-settings updates and persists', async () => {
    const putRes = await request(app)
      .put(`/api/servers/${serverId}/members/@me/notification-settings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notificationLevel: 'MUTE' });

    expect(putRes.statusCode).toBe(200);
    expect(putRes.body).toEqual({ notificationLevel: 'MUTE' });

    const getRes = await request(app)
      .get(`/api/servers/${serverId}/members/@me/notification-settings`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.statusCode).toBe(200);
    expect(getRes.body).toEqual({ notificationLevel: 'MUTE' });
  });

  it('PUT /api/servers/:serverId/members/@me/notification-settings accepts empty body (no-op)', async () => {
    const putRes = await request(app)
      .put(`/api/servers/${serverId}/members/@me/notification-settings`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(putRes.statusCode).toBe(200);
    expect(putRes.body).toEqual({ notificationLevel: 'ALL_MESSAGES' });
  });
});
