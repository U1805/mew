import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { ChannelType } from '../channel/channel.model';
import { createMessage, getMessageById } from './message.service';
import Server from '../server/server.model';
import Role from '../role/role.model';

describe('Message Routes', () => {
  const userData = {
    email: 'message-test@example.com',
    username: 'messagetest',
    password: 'password123',
  };
  let token = '';
  let userId = '';
  let channelId = '';
  let serverId = '';

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = loginRes.body.token;
    userId = loginRes.body.user._id;

    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Message Test Server' });
    serverId = serverRes.body._id;

    const channelRes = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'messages', type: ChannelType.GUILD_TEXT });
    channelId = channelRes.body._id;

    for (let i = 0; i < 20; i++) {
      await createMessage({ channelId, authorId: userId, content: `Message ${i}` });
    }
  });

  describe('GET /api/servers/:serverId/channels/:channelId/messages', () => {
    it('should get the latest messages from a channel', async () => {
      const res = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(20);
      expect(res.body[0].content).toBe('Message 19');
    });

    it('should support limit parameter', async () => {
      const res = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages?limit=10`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(10);
    });

    it('should support before parameter for pagination', async () => {
      const firstRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages?limit=10`)
        .set('Authorization', `Bearer ${token}`)

      const lastMessageId = firstRes.body[9]._id;

      const secondRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages?limit=10&before=${lastMessageId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(secondRes.statusCode).toBe(200);
      expect(secondRes.body.length).toBe(10);
      expect(secondRes.body[0].content).toBe('Message 9');
    });

    it('should return an empty array for a channel with no messages', async () => {
      const emptyChannelRes = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'empty-channel', type: ChannelType.GUILD_TEXT });
      const emptyChannelId = emptyChannelRes.body._id;

      const res = await request(app)
        .get(`/api/servers/${serverId}/channels/${emptyChannelId}/messages`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return only remaining messages when limit exceeds available count during pagination', async () => {
      const firstRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages?limit=15`)
        .set('Authorization', `Bearer ${token}`);

      expect(firstRes.body.length).toBe(15);
      const lastMessageId = firstRes.body[14]._id;

      const secondRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages?limit=10&before=${lastMessageId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(secondRes.statusCode).toBe(200);
      expect(secondRes.body.length).toBe(5);
      expect(secondRes.body[0].content).toBe('Message 4');
    });
  });

  describe('POST /api/servers/:serverId/channels/:channelId/messages', () => {
    let memberToken = '';

    describe('with permissions and mentions', () => {
      let everyoneRole: any;
      let memberToken = ''; // This will be the regular member
      let mentionedUser: any;

      const memberUserData = {
        email: 'member-ms-test@example.com',
        username: 'membermstest',
        password: 'password123',
      };

      beforeEach(async () => {
        const server = await Server.findById(serverId).lean();
        everyoneRole = await Role.findById(server.everyoneRoleId);

        await request(app).post('/api/auth/register').send(memberUserData);
        const memberLoginRes = await request(app).post('/api/auth/login').send({ email: memberUserData.email, password: memberUserData.password });
        memberToken = memberLoginRes.body.token;

        const inviteRes = await request(app).post(`/api/servers/${serverId}/invites`).set('Authorization', `Bearer ${token}`).send({});
        const inviteCode = inviteRes.body.code;
        await request(app).post(`/api/invites/${inviteCode}`).set('Authorization', `Bearer ${memberToken}`);

        const mentionedUserData = { email: 'mentioned@test.com', username: 'mentioned', password: 'password123' };
        await request(app).post('/api/auth/register').send(mentionedUserData);
        const mentionedLoginRes = await request(app).post('/api/auth/login').send({ email: mentionedUserData.email, password: mentionedUserData.password });
        mentionedUser = mentionedLoginRes.body.user;
        await request(app).post(`/api/invites/${inviteCode}`).set('Authorization', `Bearer ${mentionedLoginRes.body.token}`);
      });

      it('should return 403 if user does not have SEND_MESSAGES permission', async () => {
        everyoneRole.permissions = everyoneRole.permissions.filter(p => p !== 'SEND_MESSAGES');
        await everyoneRole.save();

        const res = await request(app)
          .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ content: 'This should be blocked' });

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toContain('You do not have the required permission: SEND_MESSAGES');
      });

      it('should add valid user IDs to the mentions array', async () => {
        const messageData = { content: `Hello <@${mentionedUser._id}>!` };
        const res = await request(app)
          .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send(messageData);

        expect(res.statusCode).toBe(201);
        expect(res.body.mentions).toEqual([mentionedUser._id]);
      });

      it('should not add non-member user IDs to mentions', async () => {
        const nonMemberId = '60f8d3b7d1e8b2001c8e4a9f';
        const messageData = { content: `Hey <@${nonMemberId}>` };
        const res = await request(app)
          .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send(messageData);

        expect(res.statusCode).toBe(201);
        expect(res.body.mentions).toEqual([]);
      });

      it('should allow @everyone for users with MENTION_EVERYONE permission (owner)', async () => {
        const res = await request(app)
          .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ content: 'Hi @everyone' });

        expect(res.statusCode).toBe(201);
      });

      it('should block @everyone for users without MENTION_EVERYONE permission', async () => {
        everyoneRole.permissions = everyoneRole.permissions.filter(p => p !== 'MENTION_EVERYONE');
        await everyoneRole.save();

        const res = await request(app)
          .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ content: 'Hey @everyone' });

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toContain('You do not have permission to use @everyone or @here');
      });
    });

    it('should create a new message as a server owner (bypassing permissions)', async () => {
      const messageData = { content: 'A new message' };
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send(messageData);

      expect(res.statusCode).toBe(201);
      expect(res.body.content).toBe(messageData.content);
      expect(res.body.authorId.username).toBe(userData.username);
    });

    it('should create a voice message and hydrate payload.voice.url', async () => {
      const voiceKey = 'voice-test.webm';
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'message/voice',
          payload: {
            voice: {
              key: voiceKey,
              contentType: 'audio/webm',
              size: 1234,
              durationMs: 3200,
            },
          },
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.type).toBe('message/voice');
      expect(res.body.content).toBe('');
      expect(res.body.attachments).toEqual([]);
      expect(res.body.payload?.voice?.key).toBe(voiceKey);
      expect(res.body.payload?.voice?.url).toContain(voiceKey);
    });
  });

  describe('PATCH /api/servers/:serverId/channels/:channelId/messages/:messageId', () => {
    let messageId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Original message' });
      messageId = res.body._id;
    });

    it('should update mentions when a message is edited', async () => {
      const mentionedUserData = { email: 'mentioned-edit@test.com', username: 'mentioned.edit', password: 'password123' };
      await request(app).post('/api/auth/register').send(mentionedUserData);
      const loginRes = await request(app).post('/api/auth/login').send({ email: mentionedUserData.email, password: mentionedUserData.password });
      const mentionedUser = loginRes.body.user;

      const inviteRes = await request(app).post(`/api/servers/${serverId}/invites`).set('Authorization', `Bearer ${token}`).send({});
      await request(app).post(`/api/invites/${inviteRes.body.code}`).set('Authorization', `Bearer ${loginRes.body.token}`);

      const initialRes = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Initial message' });
      const messageIdToEdit = initialRes.body._id;
      expect(initialRes.body.mentions).toEqual([]);

      const updatedData = { content: `Edited to mention <@${mentionedUser._id}>` };
      const editRes = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}/messages/${messageIdToEdit}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatedData);

      expect(editRes.statusCode).toBe(200);
      expect(editRes.body.mentions).toHaveLength(1);
      expect(editRes.body.mentions[0]).toBe(mentionedUser._id);
    });

    it('should update a message successfully by the author', async () => {
      const updatedData = { content: 'Updated message' };
      const res = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatedData);

      expect(res.statusCode).toBe(200);
      expect(res.body.content).toBe(updatedData.content);
      expect(res.body.editedAt).toBeDefined();
    });

    it('should return 403 if a non-author tries to update', async () => {
      const anotherUser = { email: 'another@msg.com', username: 'anothermsg', password: 'password123' };
      await request(app).post('/api/auth/register').send(anotherUser);
      const loginRes = await request(app).post('/api/auth/login').send({ email: anotherUser.email, password: anotherUser.password });
      const anotherToken = loginRes.body.token;

      const res = await request(app)
        .patch(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${anotherToken}`)
        .send({ content: 'Malicious update' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/servers/:serverId/channels/:channelId/messages/:messageId', () => {
    let messageId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Message to delete' });
      messageId = res.body._id;
    });

    it('should retract a message successfully by the author', async () => {
      const res = await request(app)
        .delete(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.content).toBe('此消息已撤回');
      expect(res.body.retractedAt).toBeDefined();

      const raw = await getMessageById(messageId);
      expect(raw.content).toBe('Message to delete');
      expect(raw.retractedAt).toBeDefined();

      const getRes = await request(app)
        .get(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.statusCode).toBe(200);
      expect(Array.isArray(getRes.body)).toBe(true);

      const retractedMessage = getRes.body.find(m => m._id === messageId);
      expect(retractedMessage).toBeDefined();
      expect(retractedMessage.content).toBe('此消息已撤回');
    });

    it('should return 403 if a non-author tries to delete', async () => {
      const anotherUser = { email: 'deleter@msg.com', username: 'deletermsg', password: 'password123' };
      await request(app).post('/api/auth/register').send(anotherUser);
      const loginRes = await request(app).post('/api/auth/login').send({ email: anotherUser.email, password: anotherUser.password });
      const anotherToken = loginRes.body.token;

      const res = await request(app)
        .delete(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${anotherToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /api/servers/:serverId/channels/:channelId/messages/:messageId/reactions/:emoji/@me', () => {
    let messageId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Message for reactions' });
      messageId = res.body._id;
    });

    it('should add a reaction to a message', async () => {
      const emoji = '??';
      const res = await request(app)
        .put(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.reactions[0].emoji).toBe(emoji);
      expect(res.body.reactions[0].userIds).toContain(userId);
    });

    it('should not add the same user twice to a reaction', async () => {
      const emoji = '??';
      await request(app)
        .put(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`)
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .put(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.reactions[0].userIds.length).toBe(1);
    });

    it('should replace the old reaction when adding a second, different one', async () => {
      const emoji1 = '👍';
      const emoji2 = '❤️';

      await request(app)
        .put(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji1)}/@me`)
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .put(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji2)}/@me`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.reactions.length).toBe(1);
      expect(res.body.reactions[0].emoji).toBe(emoji2);
      expect(res.body.reactions[0].userIds).toContain(userId);
    });
  });

  describe('DELETE /api/servers/:serverId/channels/:channelId/messages/:messageId/reactions/:emoji/@me', () => {
    let messageId: string;
    const emoji = '??';

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Message for reaction removal' });
      messageId = res.body._id;

      await request(app)
        .put(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`)
        .set('Authorization', `Bearer ${token}`);
    });

    it('should remove a reaction from a message', async () => {
      const res = await request(app)
        .delete(`/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.reactions.length).toBe(0);
    });
  });
});
