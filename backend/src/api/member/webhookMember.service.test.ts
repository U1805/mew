import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import webhookMemberService from './webhookMember.service';
import { Webhook } from '../webhook/webhook.model';
import Server from '../server/server.model';
import User from '../user/user.model';

describe('WebhookMember Service', () => {
  let testServer: any, testUser: any;

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    testUser = await User.create({ username: 'owner', email: 'owner@test.com', password: 'password' });
    testServer = await Server.create({ name: 'Test Server', ownerId: testUser._id });
  });

  it('should return an empty array if no webhooks exist', async () => {
    const webhookMembers = await webhookMemberService.getWebhookMembers(testServer._id.toString());
    expect(webhookMembers).toEqual([]);
  });

  it('should return virtual members for existing webhooks', async () => {
    const webhook1 = await Webhook.create({
      serverId: testServer._id,
      channelId: new mongoose.Types.ObjectId(),
      name: 'Test Hook 1',
      botUserId: new mongoose.Types.ObjectId(),
      token: 'token1',
    });

    const webhook2 = await Webhook.create({
        serverId: testServer._id,
        channelId: new mongoose.Types.ObjectId(),
        name: 'Test Hook 2',
        botUserId: new mongoose.Types.ObjectId(),
        token: 'token2',
      });

    const webhookMembers = await webhookMemberService.getWebhookMembers(testServer._id.toString());

    expect(webhookMembers).toHaveLength(2);

    const member1 = webhookMembers.find(m => m.userId.username === 'Test Hook 1');
    expect(member1).toBeDefined();
    expect(member1.userId.isBot).toBe(true);
    expect(member1.roleIds).toEqual([testServer.everyoneRoleId]);
    expect(member1._id.toString()).toBe(webhook1._id.toString());

    const member2 = webhookMembers.find(m => m.userId.username === 'Test Hook 2');
    expect(member2).toBeDefined();
    expect(member2._id.toString()).toBe(webhook2._id.toString());
  });

  it('should throw NotFoundError for a non-existent server', async () => {
    const nonExistentServerId = new mongoose.Types.ObjectId();
    await expect(webhookMemberService.getWebhookMembers(nonExistentServerId.toString()))
      .rejects.toThrow('Server not found');
  });
});