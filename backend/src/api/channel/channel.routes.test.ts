import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { ChannelType } from '../../models/Channel';

describe('Channel Routes', () => {
  const userData = {
    email: 'channel-test@example.com',
    username: 'channeltest',
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
      .send({ name: 'Channel Test Server' });
    serverId = serverRes.body._id;
  });

  describe('POST /api/servers/:serverId/channels', () => {
    const channelData = { name: 'general', type: ChannelType.GUILD_TEXT };

    it('should create a new channel in a server', async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send(channelData);

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe(channelData.name);
      expect(res.body.type).toBe(channelData.type);
      expect(res.body.serverId).toBe(serverId);
    });

        it('should return 403 if a user tries to create a channel in a server they do not own', async () => {
      // Create a second user (the attacker)
      const attackerData = { email: 'attacker@example.com', username: 'attacker', password: 'password123' };
      await request(app).post('/api/auth/register').send(attackerData);
      const attackerLoginRes = await request(app).post('/api/auth/login').send({ email: attackerData.email, password: attackerData.password });
      const attackerToken = attackerLoginRes.body.token;

      // Attacker tries to create a channel in the original user's server
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send(channelData);

      expect(res.statusCode).toBe(403);
    });

    it('should return 400 for invalid channel data', async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' }); // Missing type

      expect(res.statusCode).toBe(400);
    });
  });
});
