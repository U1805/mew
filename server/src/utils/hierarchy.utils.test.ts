import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import Role, { IRole } from '../api/role/role.model';
import ServerMember from '../api/member/member.model';
import { getMemberHighestRolePosition, checkMemberHierarchy, checkRoleHierarchy } from './hierarchy.utils';
import { ForbiddenError, NotFoundError } from './errors';

describe('Hierarchy Utils', () => {
  // Rely on global setup for DB connection

  beforeEach(async () => {
    await Role.deleteMany({});
    await ServerMember.deleteMany({});
  });

  const serverId = new mongoose.Types.ObjectId().toHexString();

  describe('getMemberHighestRolePosition', () => {
    it('should return the highest role position for a member', async () => {
      const userId = new mongoose.Types.ObjectId().toHexString();
      const role1 = await new Role({ serverId, name: 'Low', position: 5 }).save();
      const role2 = await new Role({ serverId, name: 'High', position: 10 }).save();
      await new ServerMember({ serverId, userId, roleIds: [role1._id, role2._id] }).save();

      const position = await getMemberHighestRolePosition(serverId, userId);
      expect(position).toBe(10);
    });

    it('should return 0 if member has no roles', async () => {
      const userId = new mongoose.Types.ObjectId().toHexString();
      await new ServerMember({ serverId, userId, roleIds: [] }).save();

      const position = await getMemberHighestRolePosition(serverId, userId);
      expect(position).toBe(0);
    });
  });

  describe('checkMemberHierarchy', () => {
    let ownerId: string, highRoleMemberId: string, lowRoleMemberId: string;
    let highRole: IRole, lowRole: IRole;

    beforeEach(async () => {
      ownerId = new mongoose.Types.ObjectId().toHexString();
      highRoleMemberId = new mongoose.Types.ObjectId().toHexString();
      lowRoleMemberId = new mongoose.Types.ObjectId().toHexString();

      highRole = await new Role({ serverId, name: 'Admin', position: 10 }).save();
      lowRole = await new Role({ serverId, name: 'Mod', position: 5 }).save();

      await new ServerMember({ serverId, userId: ownerId, isOwner: true }).save();
      await new ServerMember({ serverId, userId: highRoleMemberId, roleIds: [highRole._id] }).save();
      await new ServerMember({ serverId, userId: lowRoleMemberId, roleIds: [lowRole._id] }).save();
    });

    it('should not throw if requester is owner', async () => {
      await expect(checkMemberHierarchy(serverId, ownerId, highRoleMemberId)).resolves.toBeUndefined();
    });

    it('should not throw if requester has higher role', async () => {
      await expect(checkMemberHierarchy(serverId, highRoleMemberId, lowRoleMemberId)).resolves.toBeUndefined();
    });

    it('should throw if requester has lower role', async () => {
      await expect(checkMemberHierarchy(serverId, lowRoleMemberId, highRoleMemberId)).rejects.toThrow(ForbiddenError);
    });

    it('should throw if requester has a role with the same position', async () => {
      const anotherHighRoleId = new mongoose.Types.ObjectId().toHexString();
      const anotherHighRole = await new Role({ serverId, name: 'Co-Admin', position: 10 }).save();
      await new ServerMember({ serverId, userId: anotherHighRoleId, roleIds: [anotherHighRole._id] }).save();

      await expect(checkMemberHierarchy(serverId, highRoleMemberId, anotherHighRoleId)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('checkRoleHierarchy', () => {
    let ownerId: string, highRoleMemberId: string, lowRoleMemberId: string;
    let highRole: IRole, lowRole: IRole;

    beforeEach(async () => {
      ownerId = new mongoose.Types.ObjectId().toHexString();
      highRoleMemberId = new mongoose.Types.ObjectId().toHexString();
      lowRoleMemberId = new mongoose.Types.ObjectId().toHexString();

      highRole = await new Role({ serverId, name: 'Admin', position: 10 }).save();
      lowRole = await new Role({ serverId, name: 'Mod', position: 5 }).save();

      await new ServerMember({ serverId, userId: ownerId, isOwner: true }).save();
      await new ServerMember({ serverId, userId: highRoleMemberId, roleIds: [highRole._id] }).save();
      await new ServerMember({ serverId, userId: lowRoleMemberId, roleIds: [lowRole._id] }).save();
    });

    it('should not throw if requester is owner', async () => {
      await expect(checkRoleHierarchy(serverId, ownerId, highRole._id.toString())).resolves.toBeUndefined();
    });

    it('should not throw if requester has higher role position than target role', async () => {
      await expect(checkRoleHierarchy(serverId, highRoleMemberId, lowRole._id.toString())).resolves.toBeUndefined();
    });

    it('should throw if requester has lower role position', async () => {
      await expect(checkRoleHierarchy(serverId, lowRoleMemberId, highRole._id.toString())).rejects.toThrow(ForbiddenError);
    });

    it('should throw if requester has same role position', async () => {
      await expect(checkRoleHierarchy(serverId, highRoleMemberId, highRole._id.toString())).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError for a non-existent role', async () => {
      const nonExistentRoleId = new mongoose.Types.ObjectId().toHexString();
      await expect(checkRoleHierarchy(serverId, ownerId, nonExistentRoleId)).rejects.toThrow(NotFoundError);
    });
  });
});