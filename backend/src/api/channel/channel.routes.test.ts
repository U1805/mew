import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { ChannelType } from './channel.model.js';
import Message from '../message/message.model.js';

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

  describe('PATCH /api/servers/:serverId/channels/:channelId', () => {
    let channelId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ChannelToUpdate', type: ChannelType.GUILD_TEXT });
      channelId = res.body._id;
    });

    it('should update the channel name successfully', async () => {
      const updatedData = { name: 'Updated Channel Name' };
      const res = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatedData);

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe(updatedData.name);
    });

    it('should return 403 if a non-owner tries to update', async () => {
      const anotherUserData = { email: 'updater@example.com', username: 'updater', password: 'password123' };
      await request(app).post('/api/auth/register').send(anotherUserData);
      const loginRes = await request(app).post('/api/auth/login').send({ email: anotherUserData.email, password: anotherUserData.password });
      const anotherToken = loginRes.body.token;

      const res = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${anotherToken}`)
        .send({ name: 'Malicious Update' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/servers/:serverId/channels/:channelId', () => {
    let channelId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ChannelToDelete', type: ChannelType.GUILD_TEXT });
      channelId = res.body._id;
    });

        it('should delete the channel and its associated messages successfully', async () => {
      // 1. Create a message in the channel first
      const createMessageRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'A message to test persistence' });
      expect(createMessageRes.statusCode).toBe(201);
      const messageId = createMessageRes.body._id;

      // 2. Verify the message is there before we delete the channel
      const getMessagesRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`);
      expect(getMessagesRes.statusCode).toBe(200);
      expect(getMessagesRes.body).toBeInstanceOf(Array);
      expect(getMessagesRes.body.length).toBe(1);

      // 3. Delete the channel
      const deleteChannelRes = await request(app)
        .delete(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteChannelRes.statusCode).toBe(200);
      expect(deleteChannelRes.body.message).toBe('Channel deleted successfully');

      // 4. Verify getting the channel via API now fails (using the proper nested route)
      const getDeletedChannelRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getDeletedChannelRes.statusCode).toBe(404);

      // 5. Verify the message object has been deleted from the database
      const message = await Message.findById(messageId);
      expect(message).toBeNull();
    });

    it('should return 403 if a non-owner tries to delete', async () => {
      const anotherUserData = { email: 'deleter@example.com', username: 'deleter', password: 'password123' };
      await request(app).post('/api/auth/register').send(anotherUserData);
      const loginRes = await request(app).post('/api/auth/login').send({ email: anotherUserData.email, password: anotherUserData.password });
      const anotherToken = loginRes.body.token;

      const res = await request(app)
        .delete(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${anotherToken}`);

      expect(res.statusCode).toBe(403);
    });
  });
});
