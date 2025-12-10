import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { ChannelType } from './channel.model';
import Message from '../message/message.model';

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
      const attackerData = { email: 'attacker@example.com', username: 'attacker', password: 'password123' };
      await request(app).post('/api/auth/register').send(attackerData);
      const attackerLoginRes = await request(app).post('/api/auth/login').send({ email: attackerData.email, password: attackerData.password });
      const attackerToken = attackerLoginRes.body.token;

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

    it('should allow a member with MANAGE_CHANNEL permission to create a channel and deny without it', async () => {
      // 1. Create a new user (member) and have them join the server
      const memberData = { email: 'member@example.com', username: 'member', password: 'password123' };
      await request(app).post('/api/auth/register').send(memberData);
      const memberLoginRes = await request(app).post('/api/auth/login').send({ email: memberData.email, password: memberData.password });
      const memberToken = memberLoginRes.body.token;

      const inviteRes = await request(app)
        .post(`/api/servers/${serverId}/invites`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const inviteCode = inviteRes.body.code;

      await request(app)
        .post(`/api/invites/${inviteCode}`)
        .set('Authorization', `Bearer ${memberToken}`);

      // 2. Initially, the member (with default @everyone role) should NOT have permission
      const channelData = { name: 'permission-test', type: ChannelType.GUILD_TEXT };
      const resFail = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send(channelData);

      expect(resFail.statusCode).toBe(403);

      // 3. Grant MANAGE_CHANNEL permission to the @everyone role
      const serverDetailsRes = await request(app)
        .get(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`);
      const everyoneRoleId = serverDetailsRes.body.everyoneRoleId;

      const rolesRes = await request(app)
        .get(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${token}`);
      const everyoneRole = rolesRes.body.find((r: any) => r._id === everyoneRoleId);

      await request(app)
        .patch(`/api/servers/${serverId}/roles/${everyoneRoleId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          permissions: [...everyoneRole.permissions, 'MANAGE_CHANNEL'],
        });

      // 4. Now, the member should have permission
      const resSuccess = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ ...channelData, name: 'permission-success' });

      expect(resSuccess.statusCode).toBe(201);
      expect(resSuccess.body.name).toBe('permission-success');
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

    it("should update the channel's category successfully", async () => {
      const categoryRes = await request(app)
        .post(`/api/servers/${serverId}/categories`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Category' });
      const categoryId = categoryRes.body._id;

      const updatedData = { categoryId };
      const res = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatedData);

      expect(res.statusCode).toBe(200);
      expect(res.body.categoryId).toBe(categoryId);
    });

    it("should set channel's category to null successfully", async () => {
      const updatedData = { categoryId: null };
      const res = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatedData);

      expect(res.statusCode).toBe(200);
      expect(res.body.categoryId).toBe(null);
    });

    it('should return 400 for a non-existent categoryId', async () => {
      const updatedData = { categoryId: '60c72b2f9b1d8c001f8e4c9a' }; // Invalid ID
      const res = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatedData);

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 if the category belongs to another server', async () => {
      const anotherServerRes = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Another Server' });
      const anotherServerId = anotherServerRes.body._id;
      const anotherCategoryRes = await request(app)
        .post(`/api/servers/${anotherServerId}/categories`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Another Category' });
      const anotherCategoryId = anotherCategoryRes.body._id;

      const updatedData = { categoryId: anotherCategoryId };
      const res = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatedData);

      expect(res.statusCode).toBe(400);
    });

    it('should allow a member with MANAGE_CHANNEL permission to update and deny without it', async () => {
      const memberData = { email: 'updater@example.com', username: 'updater', password: 'password123' };
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
        .patch(`/api/servers/${serverId}/channels/${channelId}`)
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
        .send({ permissions: [...everyoneRole.permissions, 'MANAGE_CHANNEL'] });

      // Allow with permission
      const resSuccess = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send(updatedData);
      expect(resSuccess.statusCode).toBe(200);
      expect(resSuccess.body.name).toBe(updatedData.name);
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
      const createMessageRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'A message to test persistence' });
      expect(createMessageRes.statusCode).toBe(201);
      const messageId = createMessageRes.body._id;

      const getMessagesRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`);
      expect(getMessagesRes.statusCode).toBe(200);
      expect(getMessagesRes.body).toBeInstanceOf(Array);
      expect(getMessagesRes.body.length).toBe(1);

      const deleteChannelRes = await request(app)
        .delete(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteChannelRes.statusCode).toBe(200);
      expect(deleteChannelRes.body.message).toBe('Channel deleted successfully');

      const getDeletedChannelRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getDeletedChannelRes.statusCode).toBe(404);

      const message = await Message.findById(messageId);
      expect(message).toBeNull();
    });

    it('should allow a member with MANAGE_CHANNEL permission to delete and deny without it', async () => {
      const memberData = { email: 'deleter@example.com', username: 'deleter', password: 'password123' };
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

      // Deny without permission
      const resFail = await request(app)
        .delete(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resFail.statusCode).toBe(403);

      // Grant permission
      const serverDetailsRes = await request(app).get(`/api/servers/${serverId}`).set('Authorization', `Bearer ${token}`);
      const everyoneRoleId = serverDetailsRes.body.everyoneRoleId;
      const rolesRes = await request(app).get(`/api/servers/${serverId}/roles`).set('Authorization', `Bearer ${token}`);
      const everyoneRole = rolesRes.body.find((r: any) => r._id === everyoneRoleId);
      await request(app)
        .patch(`/api/servers/${serverId}/roles/${everyoneRoleId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissions: [...everyoneRole.permissions, 'MANAGE_CHANNEL'] });

      // Allow with permission
      const resSuccess = await request(app)
        .delete(`/api/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resSuccess.statusCode).toBe(200);
    });
  });

  describe('POST /:channelId/ack', () => {
    let channelId: string;
    let messageId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ChannelToAck', type: ChannelType.GUILD_TEXT });
      channelId = res.body._id;

      const messageRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Test message for ack' });
      messageId = messageRes.body._id;
    });

    it('should successfully ack a server channel', async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/ack`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lastMessageId: messageId });

      expect(res.statusCode).toBe(204);
    });

    it('should successfully ack a DM channel', async () => {
      const recipientData = { email: 'recipient@example.com', username: 'recipient', password: 'password123' };
      const recipientRegisterRes = await request(app).post('/api/auth/register').send(recipientData);
      const recipientId = recipientRegisterRes.body.user._id;
      const dmChannelRes = await request(app)
        .post('/api/users/@me/channels')
        .set('Authorization', `Bearer ${token}`)
        .send({ recipientId });
      const dmChannelId = dmChannelRes.body._id;

      const dmMessageRes = await request(app)
        .post(`/api/channels/${dmChannelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'DM for ack' });
      const dmMessageId = dmMessageRes.body._id;

      const res = await request(app)
        .post(`/api/channels/${dmChannelId}/ack`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lastMessageId: dmMessageId });

      expect(res.statusCode).toBe(204);
    });

    it('should return 403 if user is not a member of the channel', async () => {
      const attackerData = { email: 'ack-attacker@example.com', username: 'ack_attacker', password: 'password123' };
      await request(app).post('/api/auth/register').send(attackerData);
      const attackerLoginRes = await request(app).post('/api/auth/login').send({ email: attackerData.email, password: attackerData.password });
      const attackerToken = attackerLoginRes.body.token;

      const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/ack`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({ lastMessageId: messageId });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/servers/:serverId/channels', () => {
    let channelId: string;

    beforeEach(async () => {
      const channelRes = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'channel-for-listing', type: ChannelType.GUILD_TEXT });
      channelId = channelRes.body._id;
    });

    it('should return channels with lastMessage and lastReadMessageId properties', async () => {
      const messageRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'A message in a server channel' });
      const messageId = messageRes.body._id;

      const res = await request(app)
        .get(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      const channel = res.body.find((c: any) => c._id === channelId);
      expect(channel).toBeDefined();
      expect(channel).toHaveProperty('lastMessage');
      expect(channel.lastMessage._id).toBe(messageId);
      expect(channel).toHaveProperty('lastReadMessageId');
      expect(channel.lastReadMessageId).toBe(null);
    });

    it('should reflect correct read status after acking', async () => {
      const messageRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Another message in server' });
      const messageId = messageRes.body._id;

      await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/ack`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lastMessageId: messageId });

      const res = await request(app)
        .get(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`);

      const channel = res.body.find((c: any) => c._id === channelId);
      expect(channel).toBeDefined();
      expect(channel.lastMessage._id).toBe(messageId);
      expect(channel.lastReadMessageId).toBe(messageId);
    });
  });

  describe('PUT /api/servers/:serverId/channels/:channelId/permissions', () => {
    let channelId: string;
    let roleId: string;

    beforeEach(async () => {
      const channelRes = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'perms-test', type: ChannelType.GUILD_TEXT });
      channelId = channelRes.body._id;

      const roleRes = await request(app)
        .post(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Role' });
      roleId = roleRes.body._id;
    });

    it('should allow server owner to update permission overrides', async () => {
      const overrides = [
        {
          targetType: 'role',
          targetId: roleId,
          allow: ['MANAGE_MESSAGES'],
          deny: ['SEND_MESSAGES'],
        },
      ];

      const res = await request(app)
        .put(`/api/servers/${serverId}/channels/${channelId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send(overrides);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            targetType: 'role',
            targetId: roleId,
            allow: ['MANAGE_MESSAGES'],
            deny: ['SEND_MESSAGES'],
          }),
        ])
      );
    });

    it('should prevent non-owner from updating permissions', async () => {
      const anotherUserRes = await request(app).post('/api/auth/register').send({ email: 'perm-attacker@test.com', username: 'permattacker', password: 'password123' });
      const anotherUserLogin = await request(app).post('/api/auth/login').send({ email: 'perm-attacker@test.com', password: 'password123' });
      const attackerToken = anotherUserLogin.body.token;

      const res = await request(app)
        .put(`/api/servers/${serverId}/channels/${channelId}/permissions`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send([]);

      expect(res.statusCode).toBe(403);
    });

    it('should return 400 for invalid permission string', async () => {
        const overrides = [
            {
              targetType: 'role',
              targetId: roleId,
              allow: ['INVALID_PERMISSION'],
            },
          ];

        const res = await request(app)
        .put(`/api/servers/${serverId}/channels/${channelId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send(overrides);

        expect(res.statusCode).toBe(400);
    });

    it('should prevent a user from locking themselves out of managing a channel', async () => {
      // 1. Create a new user (manager) and a new role (Manager) with MANAGE_CHANNEL permission
      const managerData = { email: 'manager@example.com', username: 'manager', password: 'password123' };
      await request(app).post('/api/auth/register').send(managerData);
      const managerLoginRes = await request(app).post('/api/auth/login').send({ email: managerData.email, password: managerData.password });
      const managerToken = managerLoginRes.body.token;
      const managerId = managerLoginRes.body.user._id;

      const managerRoleRes = await request(app)
        .post(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Manager', permissions: ['MANAGE_CHANNEL'] });
      const managerRoleId = managerRoleRes.body._id;

      // 2. Have the manager join the server and assign them the Manager role
      const inviteRes = await request(app)
        .post(`/api/servers/${serverId}/invites`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      await request(app)
        .post(`/api/invites/${inviteRes.body.code}`)
        .set('Authorization', `Bearer ${managerToken}`);

      await request(app)
        .put(`/api/servers/${serverId}/members/${managerId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleIds: [managerRoleId] });

      // 3. Create a channel for the test
      const channelRes = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'self-lockout-test', type: ChannelType.GUILD_TEXT });
      const testChannelId = channelRes.body._id;

      // 4. As the manager, try to update the channel's permissions to remove their own MANAGE_CHANNEL permission
      // This is done by setting an override for their own role that denies the permission.
      const maliciousOverrides = [
        {
          targetType: 'role',
          targetId: managerRoleId,
          allow: [],
          deny: ['MANAGE_CHANNEL'], // Explicitly deny management
        },
      ];

      const res = await request(app)
        .put(`/api/servers/${serverId}/channels/${testChannelId}/permissions`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send(maliciousOverrides);

      // 5. Assert that the request was forbidden
      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('You cannot submit changes that would remove your own MANAGE_CHANNEL permission.');
    });
  });
});
