import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import inviteService from './invite.service';
import ServerMember from '../member/member.model';
import Invite from './invite.model';
import '../server/server.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import Server from '../server/server.model';

describe('Invite Service', () => {

  beforeEach(async () => {
    await Server.deleteMany({});
    await ServerMember.deleteMany({});
    await Invite.deleteMany({});
    vi.clearAllMocks();
  });

  describe('createInvite', () => {
    const serverId = new mongoose.Types.ObjectId().toHexString();
    const ownerId = new mongoose.Types.ObjectId().toHexString();
    const memberId = new mongoose.Types.ObjectId().toHexString();

    beforeEach(async () => {
      await Server.create({ _id: serverId, name: 'Test Server' });
      await ServerMember.create({ serverId, userId: ownerId, role: 'OWNER' });
      await ServerMember.create({ serverId, userId: memberId, role: 'MEMBER' });
    });

    it('should allow a server owner to create an invite', async () => {
      const invite = await inviteService.createInvite(serverId, ownerId, {});
      expect(invite).toBeDefined();
      expect(invite.serverId.toString()).toBe(serverId);
      expect(invite.creatorId.toString()).toBe(ownerId);
      expect(invite.code).toHaveLength(10);
    });

    it('should create an invite with expiration and max uses', async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      const maxUses = 10;
      const invite = await inviteService.createInvite(serverId, ownerId, { expiresAt, maxUses });

      expect(invite.maxUses).toBe(maxUses);
      // Check if dates are close enough, accounting for ms differences
      expect(Math.abs(new Date(invite.expiresAt).getTime() - new Date(expiresAt).getTime())).toBeLessThan(1000);
    });

    it('should prevent a non-owner from creating an invite', async () => {
      await expect(inviteService.createInvite(serverId, memberId, {})).rejects.toThrow(
        ForbiddenError
      );
      await expect(inviteService.createInvite(serverId, memberId, {})).rejects.toThrow(
        'Only the server owner can create invites.'
      );
    });
  });

  describe('getInviteDetails', () => {
    const serverId = new mongoose.Types.ObjectId().toHexString();
    const ownerId = new mongoose.Types.ObjectId().toHexString();
    let validInvite: any;

    beforeEach(async () => {
      await Server.create({ _id: serverId, name: 'Test Server' });
      await ServerMember.create({ serverId, userId: ownerId, role: 'OWNER' });
      validInvite = await inviteService.createInvite(serverId, ownerId, {});
    });

    it('should return details for a valid invite code', async () => {
      const inviteDetails = await inviteService.getInviteDetails(validInvite.code);
      expect(inviteDetails).toBeDefined();
      expect(inviteDetails.code).toBe(validInvite.code);
      expect(inviteDetails.server).toHaveProperty('name');
    });

    it('should throw NotFoundError for an invalid code', async () => {
      await expect(inviteService.getInviteDetails('invalidcode')).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError for an expired invite', async () => {
      const expiredInvite = await Invite.create({
        code: 'expired',
        serverId,
        creatorId: ownerId,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(inviteService.getInviteDetails(expiredInvite.code)).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when max uses is reached', async () => {
      const usedInvite = await Invite.create({
        code: 'usedup',
        serverId,
        creatorId: ownerId,
        maxUses: 1,
        uses: 1,
      });

      await expect(inviteService.getInviteDetails(usedInvite.code)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('acceptInvite', () => {
    const serverId = new mongoose.Types.ObjectId().toHexString();
    const ownerId = new mongoose.Types.ObjectId().toHexString();
    const newUserId = new mongoose.Types.ObjectId().toHexString();
    const existingMemberId = new mongoose.Types.ObjectId().toHexString();
    let validInvite: any;

    beforeEach(async () => {
      await Server.create({ _id: serverId, name: 'Test Server' });
      await ServerMember.create([
        { serverId, userId: ownerId, role: 'OWNER' },
        { serverId, userId: existingMemberId, role: 'MEMBER' },
      ]);
      validInvite = await inviteService.createInvite(serverId, ownerId, {});
    });

    it('should allow a new user to accept an invite and become a member', async () => {
      const result = await inviteService.acceptInvite(validInvite.code, newUserId);

      const memberRecord = await ServerMember.findOne({ serverId, userId: newUserId });
      expect(memberRecord).not.toBeNull();
      expect(memberRecord?.role).toBe('MEMBER');

      const updatedInvite = await Invite.findById(validInvite._id);
      expect(updatedInvite?.uses).toBe(1);
      expect(result.code).toBe(validInvite.code);
    });

    it('should not create a new member record if user is already a member', async () => {
      const memberCountBefore = await ServerMember.countDocuments({ serverId });
      await inviteService.acceptInvite(validInvite.code, existingMemberId);
      const memberCountAfter = await ServerMember.countDocuments({ serverId });

      expect(memberCountAfter).toBe(memberCountBefore);

      const updatedInvite = await Invite.findById(validInvite._id);
      expect(updatedInvite?.uses).toBe(0); // Should not increment uses
    });

    it('should throw an error for an invalid invite code', async () => {
      await expect(inviteService.acceptInvite('invalid-code', newUserId)).rejects.toThrow(NotFoundError);
    });
  });
});
