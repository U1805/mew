import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
// Mock the socketManager to prevent errors in tests that indirectly trigger socket events
vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcastToUser: vi.fn(),
    broadcast: vi.fn(),
  },
}));
import app from '../../app';
import ServerMemberModel from '../member/member.model';
import RoleModel from '../role/role.model';
import { Webhook } from '../webhook/webhook.model';

describe('Server Routes', () => {
  const userData = {
    email: 'server-test@example.com',
    username: 'servertest',
    password: 'password123',
  };
  let token = '';
  let userId = '';

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(userData);
    const res = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = res.body.token;
    userId = res.body.user._id;
  });

    describe('GET /api/servers/:serverId', () => {
        it('should return 400 for an invalid serverId format', async () => {
      const invalidServerId = '123';
      const res = await request(app)
        .get(`/api/servers/${invalidServerId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for a non-existent server', async () => {
      const nonExistentServerId = '605cde185e49a821e84d516d'; // Example ObjectId
      const res = await request(app)
        .get(`/api/servers/${nonExistentServerId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
    });

    it('should return server details for a valid serverId', async () => {
      const serverRes = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Details Test Server' });

      const serverId = serverRes.body._id;

      const res = await request(app)
        .get(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Details Test Server');
      expect(res.body._id).toBe(serverId);
    });
  });

  describe('GET /api/users/@me/servers', () => {
    it('should return a list of servers the user owns', async () => {
      await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Server One' });

      await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Server Two' });

      const res = await request(app)
        .get('/api/users/@me/servers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      expect(res.body.some((s: any) => s.name === 'Server One')).toBe(true);
      expect(res.body.some((s: any) => s.name === 'Server Two')).toBe(true);
    });
  });

  describe('POST /api/servers', () => {
    const serverData = { name: 'My Test Server' };

    it('should return 401 if no token is provided', async () => {
      const res = await request(app).post('/api/servers').send(serverData);
      expect(res.statusCode).toBe(401);
    });

    it('should create a new server and a corresponding owner member entry', async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send(serverData);

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe(serverData.name);
      expect(res.body).not.toHaveProperty('ownerId');

      const serverId = res.body._id;
      const member = await ServerMemberModel.findOne({ serverId, userId });

      expect(member).not.toBeNull();
      expect(member?.isOwner).toBe(true);

      const everyoneRole = await RoleModel.findOne({ serverId, isDefault: true });
      expect(everyoneRole).not.toBeNull();
      expect(everyoneRole?.name).toBe('@everyone');

      // Check if server has the everyoneRoleId
      const server = await request(app).get(`/api/servers/${serverId}`).set('Authorization', `Bearer ${token}`);
      expect(server.body.everyoneRoleId).toBe(everyoneRole?._id.toString());

      // Check if owner member has the everyoneRole id
      expect(member?.roleIds.map(id => id.toString())).toContain(everyoneRole?._id.toString());
    });

    it('should return 400 for invalid server data', async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' }); // Invalid name

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/servers/:serverId', () => {
    let serverId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ServerToUpdate' });
      serverId = res.body._id;
    });

    it('should update the server name successfully', async () => {
      const updatedData = { name: 'Updated Server Name' };
      const res = await request(app)
        .patch(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatedData);

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe(updatedData.name);
    });

    it('should return 403 if a non-owner tries to update', async () => {
      // Create a new user and token
      const anotherUserData = { email: 'another@example.com', username: 'another', password: 'password123' };
      await request(app).post('/api/auth/register').send(anotherUserData);
      const loginRes = await request(app).post('/api/auth/login').send({ email: anotherUserData.email, password: anotherUserData.password });
      const anotherToken = loginRes.body.token;

      const res = await request(app)
        .patch(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${anotherToken}`)
        .send({ name: 'Malicious Update' });

      expect(res.statusCode).toBe(403);
    });

    it('should return 400 for invalid update data', async () => {
      const res = await request(app)
        .patch(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' });

      expect(res.statusCode).toBe(400);
    });

    it('should allow a member with MANAGE_SERVER permission to update and deny without it', async () => {
      const memberData = { email: 'server-updater@example.com', username: 'serverupdater', password: 'password123' };
      await request(app).post('/api/auth/register').send(memberData);
      const memberLoginRes = await request(app).post('/api/auth/login').send({ email: memberData.email, password: memberData.password });
      const memberToken = memberLoginRes.body.token;

      const inviteRes = await request(app)
        .post(`/api/servers/${serverId}/invites`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      await request(app)
        .post(`/api/invites/${inviteRes.body.code}`)
        .set('Authorization', `Bearer ${memberToken}`);

      const updatedData = { name: 'Permission Update Test' };

      // Deny without permission
      const resFail = await request(app)
        .patch(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send(updatedData);
      expect(resFail.statusCode).toBe(403);

      // Grant permission
      const serverDetailsRes = await request(app).get(`/api/servers/${serverId}`).set('Authorization', `Bearer ${token}`);
      const everyoneRoleId = serverDetailsRes.body.everyoneRoleId;
      const rolesRes = await request(app).get(`/api/servers/${serverId}/roles`).set('Authorization', `Bearer ${token}`);
      const everyoneRole = rolesRes.body.find((r: any) => r._id === everyoneRoleId);
      await request(app)
        .patch(`/api/servers/${serverId}/roles/${everyoneRoleId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissions: [...everyoneRole.permissions, 'MANAGE_SERVER'] });

      // Allow with permission
      const resSuccess = await request(app)
        .patch(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send(updatedData);
      expect(resSuccess.statusCode).toBe(200);
      expect(resSuccess.body.name).toBe(updatedData.name);
    });
  });

  describe('DELETE /api/servers/:serverId', () => {
    let serverId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ServerToDelete' });
      serverId = res.body._id;
    });

    it('should delete the server successfully', async () => {
      const res = await request(app)
        .delete(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Server deleted successfully');

      // Verify it's gone
      const getRes = await request(app)
        .get(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.statusCode).toBe(404);
    });

    it('should return 403 if a non-owner tries to delete', async () => {
      const anotherUserData = { email: 'deleter@example.com', username: 'deleter', password: 'password123' };
      await request(app).post('/api/auth/register').send(anotherUserData);
      const loginRes = await request(app).post('/api/auth/login').send({ email: anotherUserData.email, password: anotherUserData.password });
      const anotherToken = loginRes.body.token;

      const res = await request(app)
        .delete(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${anotherToken}`);

      expect(res.statusCode).toBe(403);
    });

    it('should cascade delete all channels and messages within the server', async () => {
      // 1. Create a channel in the server
      const channelRes = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'General', type: 'GUILD_TEXT' });
      const channelId = channelRes.body._id;
      expect(channelRes.statusCode).toBe(201);

      // 2. Create a message in the channel
      const messageRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello, world!' });
      expect(messageRes.statusCode).toBe(201);

      // 3. Delete the server
      const deleteRes = await request(app)
        .delete(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteRes.statusCode).toBe(200);

      // 4. Verify the channel is deleted
      const getChannelRes = await request(app)
        .get(`/api/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getChannelRes.statusCode).toBe(404);

      // 5. Verify members and roles are deleted
      const memberCount = await ServerMemberModel.countDocuments({ serverId });
      expect(memberCount).toBe(0);

      const roleCount = await RoleModel.countDocuments({ serverId });
      expect(roleCount).toBe(0);
    });

    it('should cascade delete all webhooks within the server', async () => {
      // 1. Create a channel
      const channelRes = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'webhook-test-channel', type: 'GUILD_TEXT' });
      const channelId = channelRes.body._id;

      // 2. Create a webhook in the channel
      const webhookRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Webhook' });
      const webhookId = webhookRes.body._id;
      expect(webhookRes.statusCode).toBe(201);

      // 3. Delete the server
      const deleteRes = await request(app)
        .delete(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteRes.statusCode).toBe(200);

      // 4. Verify the webhook is deleted directly from the database
      const webhook = await Webhook.findById(webhookId);
      expect(webhook).toBeNull();
    });
  });

  describe('POST /api/servers/:serverId/icon', () => {
    let serverId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ServerForIconUpload' });
      serverId = res.body._id;
    });

    it('should allow the owner to upload a server icon', async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/icon`)
        .set('Authorization', `Bearer ${token}`)
        .attach('icon', Buffer.from('fake icon data'), 'icon.png');

      expect(res.statusCode).toBe(200);
      expect(res.body.avatarUrl).toBeDefined();
      expect(res.body.avatarUrl).toMatch(/\.png$/);
    });

    it('should return 403 if a non-member tries to upload', async () => {
      const anotherUserData = { email: 'non-member@example.com', username: 'nonmember', password: 'password123' };
      await request(app).post('/api/auth/register').send(anotherUserData);
      const loginRes = await request(app).post('/api/auth/login').send({ email: anotherUserData.email, password: anotherUserData.password });
      const anotherToken = loginRes.body.token;

      const res = await request(app)
        .post(`/api/servers/${serverId}/icon`)
        .set('Authorization', `Bearer ${anotherToken}`)
        .attach('icon', Buffer.from('fake icon data'), 'icon.png');

      expect(res.statusCode).toBe(403); // Forbidden, as they aren't even a member
    });

    it('should return 403 if a member without MANAGE_SERVER permission tries to upload', async () => {
      const memberData = { email: 'icon-member@example.com', username: 'iconmember', password: 'password123' };
      await request(app).post('/api/auth/register').send(memberData);
      const memberLoginRes = await request(app).post('/api/auth/login').send({ email: memberData.email, password: memberData.password });
      const memberToken = memberLoginRes.body.token;

      // Make the user a member
      const inviteRes = await request(app).post(`/api/servers/${serverId}/invites`).set('Authorization', `Bearer ${token}`).send({});
      await request(app).post(`/api/invites/${inviteRes.body.code}`).set('Authorization', `Bearer ${memberToken}`);

      const res = await request(app)
        .post(`/api/servers/${serverId}/icon`)
        .set('Authorization', `Bearer ${memberToken}`)
        .attach('icon', Buffer.from('fake icon data'), 'icon.png');

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('You do not have the required permission: MANAGE_SERVER');
    });

    it('should return 400 for invalid file type', async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/icon`)
        .set('Authorization', `Bearer ${token}`)
        .attach('icon', Buffer.from('this is not an image'), 'test.txt');

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid file type');
    });
  });
});
