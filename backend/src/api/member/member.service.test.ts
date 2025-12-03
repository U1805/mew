import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import memberService from './member.service';
import ServerMember from './member.model';
import '../../api/user/user.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';

describe('Member Service', () => {

  let serverId: string;
  let ownerId: string;
  let member1Id: string;
  let nonMemberId: string;

  beforeEach(async () => {
    await ServerMember.deleteMany({});
    serverId = new mongoose.Types.ObjectId().toHexString();
    ownerId = new mongoose.Types.ObjectId().toHexString();
    member1Id = new mongoose.Types.ObjectId().toHexString();
    nonMemberId = new mongoose.Types.ObjectId().toHexString();

    await ServerMember.create([
      { serverId, userId: ownerId, role: 'OWNER' },
      { serverId, userId: member1Id, role: 'MEMBER' },
    ]);
  });

  describe('getMembersByServer', () => {
    it('should return member list for a server member', async () => {
      const members = await memberService.getMembersByServer(serverId, ownerId);
      expect(members.length).toBe(2);
    });

    it('should throw ForbiddenError for a non-member', async () => {
      await expect(memberService.getMembersByServer(serverId, nonMemberId)).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  describe('removeMember', () => {
    it('should allow owner to remove a member', async () => {
      await memberService.removeMember(serverId, member1Id, ownerId);
      const member = await ServerMember.findOne({ serverId, userId: member1Id });
      expect(member).toBeNull();
    });

    it('should prevent owner from removing themselves', async () => {
      await expect(memberService.removeMember(serverId, ownerId, ownerId)).rejects.toThrow(
        'You cannot remove yourself.'
      );
    });

    it('should prevent non-owner from removing a member', async () => {
      await expect(memberService.removeMember(serverId, ownerId, member1Id)).rejects.toThrow(
        'Only the server owner can remove members.'
      );
    });

    it('should throw NotFoundError if member to remove does not exist', async () => {
      const nonExistentUserId = new mongoose.Types.ObjectId().toHexString();
      await expect(memberService.removeMember(serverId, nonExistentUserId, ownerId)).rejects.toThrow(
        NotFoundError
      );
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
      await ServerMember.create({ serverId, userId: anotherOwnerId, role: 'OWNER' });

      await memberService.leaveServer(serverId, ownerId);
      const member = await ServerMember.findOne({ serverId, userId: ownerId });
      expect(member).toBeNull();
    });
  });
});
