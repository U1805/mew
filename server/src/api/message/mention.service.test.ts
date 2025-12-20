import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import mentionService from './mention.service';
import Server from '../server/server.model';
import User from '../user/user.model';
import Channel from '../channel/channel.model';
import Member from '../member/member.model';
import Role from '../role/role.model';

describe('Mention Service', () => {
  let testUser: any, mentionedUser: any, testServer: any, testChannel: any;

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    vi.clearAllMocks();

    testUser = await User.create({ username: 'testuser', email: 'test@test.com', password: 'password' });
    mentionedUser = await User.create({ username: 'mentioned', email: 'mentioned@test.com', password: 'password' });
    testServer = await Server.create({ name: 'Test Server', ownerId: testUser._id });
    testChannel = await Channel.create({ name: 'test-channel', serverId: testServer._id, type: 'GUILD_TEXT' });

    const everyoneRole = await Role.create({ serverId: testServer._id, name: '@everyone', permissions: [], position: 0 });
    testServer.everyoneRoleId = everyoneRole._id;
    await testServer.save();

    await Member.create({ serverId: testServer._id, userId: testUser._id, isOwner: true, roleIds: [everyoneRole._id] });
    await Member.create({ serverId: testServer._id, userId: mentionedUser._id, roleIds: [everyoneRole._id] });
  });

  describe('processMentions', () => {
    it('should return an empty array for content with no mentions', async () => {
      const content = 'Hello world!';
      const mentions = await mentionService.processMentions(content, testChannel._id.toString(), testUser._id.toString());
      expect(mentions).toEqual([]);
    });

    it('should correctly parse and validate a single user mention', async () => {
      const content = `Hello <@${mentionedUser._id}>!`;
      const mentions = await mentionService.processMentions(content, testChannel._id.toString(), testUser._id.toString());
      expect(mentions).toHaveLength(1);
      expect(mentions[0].toString()).toBe(mentionedUser._id.toString());
    });

    it('should not include non-member users in mentions', async () => {
        const nonMember = await User.create({ username: 'nonmember', email: 'non@member.com', password: 'password' });
        const content = `Hello <@${mentionedUser._id}> and <@${nonMember._id}>`;
        const mentions = await mentionService.processMentions(content, testChannel._id.toString(), testUser._id.toString());
        expect(mentions).toHaveLength(1);
        expect(mentions[0].toString()).toBe(mentionedUser._id.toString());
    });

    it('should throw ForbiddenError when a non-permitted user uses @everyone', async () => {
        const regularMember = await User.create({ username: 'regular', email: 'reg@member.com', password: 'password' });
        // Ensure the server has a valid @everyone role ID
        const everyoneRole = await Role.create({ serverId: testServer._id, name: '@everyone', permissions: [], position: 0 });
        testServer.everyoneRoleId = everyoneRole._id;
        await testServer.save();

        await Member.create({ serverId: testServer._id, userId: regularMember._id, roleIds: [everyoneRole._id] });
        const content = 'Hey @everyone';

        await expect(mentionService.processMentions(content, testChannel._id.toString(), regularMember._id.toString()))
            .rejects.toThrow('You do not have permission to use @everyone or @here in this channel.');
    });

    it('should allow a permitted user (owner) to use @everyone', async () => {
        const content = 'Announcement @everyone';
        const mentions = await mentionService.processMentions(content, testChannel._id.toString(), testUser._id.toString());
        // @everyone doesn't add to the mentions array, it just passes the permission check
        expect(mentions).toEqual([]);
    });

    it('should allow a user with MENTION_EVERYONE permission to use @here', async () => {
      const memberWithPerms = await User.create({ username: 'powerful', email: 'power@ful.com', password: 'password' });
      const role = await Role.create({ serverId: testServer._id, name: 'Mentioners', permissions: ['MENTION_EVERYONE'], position: 1 });
      await Member.create({ serverId: testServer._id, userId: memberWithPerms._id, roleIds: [role._id] });
      // Ensure the server has a valid @everyone role ID
      const everyoneRole = await Role.create({ serverId: testServer._id, name: '@everyone', permissions: [], position: 0 });
        testServer.everyoneRoleId = everyoneRole._id;
        await testServer.save();

      const content = 'Are you all here? @here';
      // Should not throw
      const mentions = await mentionService.processMentions(content, testChannel._id.toString(), memberWithPerms._id.toString());
      expect(mentions).toEqual([]);
    })
  });
});