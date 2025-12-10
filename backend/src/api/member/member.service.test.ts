import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcast: vi.fn(),
    init: vi.fn(),
    getIO: vi.fn(),
  },
}));

import mongoose from 'mongoose';
import memberService from './member.service';
import ServerMember from './member.model';
import User from '../user/user.model';
import { Webhook } from '../webhook/webhook.model';
import Server from '../server/server.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { socketManager } from '../../gateway/events';

describe('Member Service', () => {

  let serverId: string;
  let ownerId: string;
  let member1Id: string;
  let nonMemberId: string;

  beforeAll(async () => {
    serverId = new mongoose.Types.ObjectId().toHexString();
    ownerId = new mongoose.Types.ObjectId().toHexString();
    member1Id = new mongoose.Types.ObjectId().toHexString();
    nonMemberId = new mongoose.Types.ObjectId().toHexString();

    await User.create([
      { _id: ownerId, email: 'owner@test.com', username: 'owner', password: 'password123' },
      { _id: member1Id, email: 'member1@test.com', username: 'member1', password: 'password123' },
      {
        _id: nonMemberId,
        email: 'nonmember@test.com',
        username: 'nonmember',
        password: 'password123',
      },
    ]);
  });

  beforeEach(async () => {
    await ServerMember.deleteMany({});
    await ServerMember.create([
      { serverId, userId: ownerId, isOwner: true, roleIds: [] },
      { serverId, userId: member1Id, isOwner: false, roleIds: [] },
    ]);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await ServerMember.deleteMany({});
    await User.deleteMany({});
  });

  describe('getMembersByServer', () => {
    let everyoneRoleId: string;

    beforeEach(async () => {
      await Webhook.deleteMany({});
      await Server.deleteMany({});

      everyoneRoleId = new mongoose.Types.ObjectId().toHexString();
      await Server.create({ _id: serverId, name: 'Test Server', everyoneRoleId });

      await Webhook.create({
        _id: new mongoose.Types.ObjectId(),
        name: 'Test Webhook',
        avatarUrl: 'http://example.com/webhook.png',
        serverId,
        channelId: new mongoose.Types.ObjectId().toHexString(),
        botUserId: new mongoose.Types.ObjectId().toHexString(),
        token: 'test-token',
      });
    });

    it('should return member list for a server member', async () => {
      const members = await memberService.getMembersByServer(serverId, ownerId);
      // 2 real members + 1 webhook
      expect(members.length).toBe(3);
    });

    it('should include virtual members for webhooks', async () => {
      const members = await memberService.getMembersByServer(serverId, ownerId);
      const webhookMember = members.find(m => m.userId && m.userId.isBot);

      expect(webhookMember).toBeDefined();
      expect(webhookMember.userId.username).toBe('Test Webhook');
      expect(webhookMember.userId.avatarUrl).toBe('http://example.com/webhook.png');
      expect(webhookMember.userId.isBot).toBe(true);
      expect(webhookMember.roleIds.map(String)).toContain(everyoneRoleId);
    });

    it('should throw ForbiddenError for a non-member', async () => {
      await expect(memberService.getMembersByServer(serverId, nonMemberId)).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  describe('removeMember', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should allow owner to remove a member', async () => {
      await memberService.removeMember(serverId, member1Id, ownerId);
      const member = await ServerMember.findOne({ serverId, userId: member1Id });
      expect(member).toBeNull();
    });

    it('should broadcast SERVER_KICK event to the kicked user', async () => {
      await memberService.removeMember(serverId, member1Id, ownerId);

      expect(socketManager.broadcast).toHaveBeenCalledWith(
        'SERVER_KICK',
        member1Id,
        { serverId }
      );
    });

    it('should broadcast MEMBER_LEAVE event to the server room', async () => {
      await memberService.removeMember(serverId, member1Id, ownerId);

      expect(socketManager.broadcast).toHaveBeenCalledWith(
        'MEMBER_LEAVE',
        serverId,
        { serverId, userId: member1Id }
      );
    });

    it('should broadcast both events in correct order', async () => {
      await memberService.removeMember(serverId, member1Id, ownerId);

      const calls = (socketManager.broadcast as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBe(2);

      // First call: SERVER_KICK to kicked user
      expect(calls[0]).toEqual(['SERVER_KICK', member1Id, { serverId }]);

      // Second call: MEMBER_LEAVE to server room
      expect(calls[1]).toEqual(['MEMBER_LEAVE', serverId, { serverId, userId: member1Id }]);
    });

    it('should prevent owner from removing themselves', async () => {
      await expect(memberService.removeMember(serverId, ownerId, ownerId)).rejects.toThrow(
        'You cannot remove yourself.'
      );
    });

    it('should prevent non-owner from removing a member', async () => {
      await expect(memberService.removeMember(serverId, ownerId, member1Id)).rejects.toThrow(
        'You cannot manage a user with an equal or higher role position than your own.'
      );
    });

    it('should throw NotFoundError if member to remove does not exist', async () => {
      const nonExistentUserId = new mongoose.Types.ObjectId().toHexString();
      await expect(memberService.removeMember(serverId, nonExistentUserId, ownerId)).rejects.toThrow(
        NotFoundError
      );
    });

    it('should not broadcast events if removal fails', async () => {
      const nonExistentUserId = new mongoose.Types.ObjectId().toHexString();

      try {
        await memberService.removeMember(serverId, nonExistentUserId, ownerId);
      } catch (error) {
        // Expected to throw
      }

      expect(socketManager.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('leaveServer', () => {
    it('should allow a member to leave', async () => {
      await memberService.leaveServer(serverId, member1Id);
      const member = await ServerMember.findOne({ serverId, userId: member1Id });
      expect(member).toBeNull();
    });

    it('should throw NotFoundError if a non-member tries to leave', async () => {
      await expect(memberService.leaveServer(serverId, nonMemberId)).rejects.toThrow(
        'You are not a member of this server.'
      );
    });

    it('should prevent the only owner from leaving', async () => {
      await expect(memberService.leaveServer(serverId, ownerId)).rejects.toThrow(
        'You are the only owner. Please transfer ownership before leaving.'
      );
    });

    it('should allow an owner to leave if there are other owners', async () => {
      const anotherOwnerId = new mongoose.Types.ObjectId().toHexString();
      await ServerMember.create({ serverId, userId: anotherOwnerId, isOwner: true });

      await memberService.leaveServer(serverId, ownerId);
      const member = await ServerMember.findOne({ serverId, userId: ownerId });
      expect(member).toBeNull();
    });
  });
});
