import { describe, it, expect, vi } from 'vitest';
import { calculateEffectivePermissions } from './permission.service';
import { IServerMember } from '../api/member/member.model';
import { IRole } from '../api/role/role.model';
import { ChannelType, IChannel } from '../api/channel/channel.model';
import { Types } from 'mongoose';
import { ALL_PERMISSIONS } from '../constants/permissions';

// Helper to create a mock ObjectId
const newId = () => new Types.ObjectId();

// Mock data factory
const createMockRole = (
  id: Types.ObjectId,
  permissions: string[],
  position: number,
  isDefault = false
): IRole =>
  ({
    _id: id,
    name: `Role ${id.toHexString()}`,
    permissions,
    position,
    isDefault,
    //... other IRole properties
  } as IRole);

const createMockMember = (
  userId: Types.ObjectId,
  roleIds: Types.ObjectId[],
  isOwner = false
): IServerMember =>
  ({
    userId,
    roleIds,
    isOwner,
    //... other IServerMember properties
  } as IServerMember);

const createMockChannel = (
  type: ChannelType,
  overrides: any[] = []
): IChannel =>
  ({
    type,
    permissionOverrides: overrides,
    //... other IChannel properties
  } as IChannel);

describe('Permission Service - calculateEffectivePermissions', () => {
  const user1Id = newId();
  const role1Id = newId();
  const role2Id = newId();
  const everyoneRoleId = newId();

  it('should grant all permissions to the server owner', () => {
    const ownerMember = createMockMember(user1Id, [], true);
    const channel = createMockChannel(ChannelType.GUILD_TEXT);
    const permissions = calculateEffectivePermissions(
      ownerMember,
      [],
      createMockRole(everyoneRoleId, [], 0, true),
      channel
    );
    expect(permissions).toEqual(new Set(ALL_PERMISSIONS));
  });

  it('should grant default DM permissions for a DM channel', () => {
    const member = createMockMember(user1Id, [everyoneRoleId]);
    const channel = createMockChannel(ChannelType.DM);
    const permissions = calculateEffectivePermissions(
      member,
      [],
      createMockRole(everyoneRoleId, [], 0, true),
      channel
    );
    expect(permissions).toEqual(new Set(['VIEW_CHANNEL', 'SEND_MESSAGES', 'ADD_REACTIONS', 'ATTACH_FILES']));
  });

  it('should combine base permissions from @everyone and other roles', () => {
    const everyoneRole = createMockRole(everyoneRoleId, ['VIEW_CHANNEL'], 0, true);
    const memberRole = createMockRole(role1Id, ['SEND_MESSAGES'], 1);
    const member = createMockMember(user1Id, [everyoneRoleId, role1Id]);
    const channel = createMockChannel(ChannelType.GUILD_TEXT);

    const permissions = calculateEffectivePermissions(
      member,
      [memberRole],
      everyoneRole,
      channel
    );

    expect(permissions).toEqual(new Set(['VIEW_CHANNEL', 'SEND_MESSAGES']));
  });

  it('should grant all permissions if a role has ADMINISTRATOR', () => {
    const adminRole = createMockRole(role1Id, ['ADMINISTRATOR'], 2);
    const everyoneRole = createMockRole(everyoneRoleId, ['VIEW_CHANNEL'], 0, true);
    const member = createMockMember(user1Id, [everyoneRoleId, role1Id]);
    const channel = createMockChannel(ChannelType.GUILD_TEXT);

    const permissions = calculateEffectivePermissions(
      member,
      [adminRole],
      everyoneRole,
      channel
    );

    expect(permissions).toEqual(new Set(ALL_PERMISSIONS));
  });

 it('should apply a DENY override from @everyone', () => {
    const everyoneRole = createMockRole(everyoneRoleId, ['VIEW_CHANNEL', 'SEND_MESSAGES'], 0, true);
    const member = createMockMember(user1Id, [everyoneRoleId]);
    const channel = createMockChannel(ChannelType.GUILD_TEXT, [
      {
        targetType: 'role',
        targetId: everyoneRoleId,
        allow: [],
        deny: ['SEND_MESSAGES'],
      },
    ]);

    const permissions = calculateEffectivePermissions(member, [], everyoneRole, channel);

    expect(permissions).toEqual(new Set(['VIEW_CHANNEL']));
  });

  it('should apply an ALLOW override from a specific role', () => {
    const everyoneRole = createMockRole(everyoneRoleId, ['VIEW_CHANNEL'], 0, true);
    const specificRole = createMockRole(role1Id, [], 1);
    const member = createMockMember(user1Id, [everyoneRoleId, role1Id]);
    const channel = createMockChannel(ChannelType.GUILD_TEXT, [
      {
        targetType: 'role',
        targetId: role1Id,
        allow: ['SEND_MESSAGES'],
        deny: [],
      },
    ]);

    const permissions = calculateEffectivePermissions(
      member,
      [specificRole],
      everyoneRole,
      channel
    );

    expect(permissions).toEqual(new Set(['VIEW_CHANNEL', 'SEND_MESSAGES']));
  });


  it('should prioritize member-specific overrides over role overrides', () => {
    const everyoneRole = createMockRole(everyoneRoleId, ['VIEW_CHANNEL'], 0, true);
    const specificRole = createMockRole(role1Id, [], 1);
    const member = createMockMember(user1Id, [everyoneRoleId, role1Id]);
    const channel = createMockChannel(ChannelType.GUILD_TEXT, [
      // Role override denies SEND_MESSAGES
      { targetType: 'role', targetId: role1Id, allow: [], deny: ['SEND_MESSAGES'] },
      // Member override allows SEND_MESSAGES
      { targetType: 'member', targetId: user1Id, allow: ['SEND_MESSAGES'], deny: [] },
    ]);

    const permissions = calculateEffectivePermissions(member, [specificRole], everyoneRole, channel);

    expect(permissions).toContain('SEND_MESSAGES');
  });

  it('should return an empty set if VIEW_CHANNEL is denied', () => {
    const everyoneRole = createMockRole(everyoneRoleId, ['VIEW_CHANNEL', 'SEND_MESSAGES'], 0, true);
    const member = createMockMember(user1Id, [everyoneRoleId]);
    const channel = createMockChannel(ChannelType.GUILD_TEXT, [
        { targetType: 'role', targetId: everyoneRoleId, allow:[], deny: ['VIEW_CHANNEL'] }
    ]);

    const permissions = calculateEffectivePermissions(member, [], everyoneRole, channel);

    expect(permissions).toEqual(new Set());
  });

  it('should correctly apply overrides based on role position hierarchy', () => {
    const everyoneRole = createMockRole(everyoneRoleId, ['VIEW_CHANNEL'], 0, true);
    const lowerRole = createMockRole(role1Id, [], 1); // position 1
    const higherRole = createMockRole(role2Id, [], 2); // position 2
    const member = createMockMember(user1Id, [everyoneRoleId, role1Id, role2Id]);

    const channel = createMockChannel(ChannelType.GUILD_TEXT, [
      // Lower role DENIES sending messages
      { targetType: 'role', targetId: role1Id, allow: [], deny: ['SEND_MESSAGES'] },
      // Higher role ALLOWS sending messages
      { targetType: 'role', targetId: role2Id, allow: ['SEND_MESSAGES'], deny: [] },
    ]);

    const permissions = calculateEffectivePermissions(
      member,
      [lowerRole, higherRole], // Order in array doesn't matter
      everyoneRole,
      channel
    );

    // The higher role's ALLOW should win
    expect(permissions).toContain('SEND_MESSAGES');
  });

  it('should handle complex interactions between allow and deny across levels', () => {
    const everyoneRole = createMockRole(
      everyoneRoleId,
      ['VIEW_CHANNEL', 'ADD_REACTIONS'],
      0,
      true
    );
    const modRole = createMockRole(role1Id, [], 1);
    const vipRole = createMockRole(role2Id, [], 2);
    const member = createMockMember(user1Id, [everyoneRoleId, modRole._id, vipRole._id]);

    const channel = createMockChannel(ChannelType.GUILD_TEXT, [
      // @everyone is denied sending messages but allowed attaching files
      { targetType: 'role', targetId: everyoneRoleId, allow: ['ATTACH_FILES'], deny: ['SEND_MESSAGES'] },
      // mods are allowed to send messages
      { targetType: 'role', targetId: modRole._id, allow: ['SEND_MESSAGES'], deny: [] },
      // VIPs are denied attaching files
      { targetType: 'role', targetId: vipRole._id, allow: [], deny: ['ATTACH_FILES'] },
      // This specific member is allowed to do both
      { targetType: 'member', targetId: user1Id, allow: ['SEND_MESSAGES', 'ATTACH_FILES'], deny: [] },
    ]);

    const permissions = calculateEffectivePermissions(member, [modRole, vipRole], everyoneRole, channel);

    expect(permissions).toEqual(new Set(['VIEW_CHANNEL', 'ADD_REACTIONS', 'SEND_MESSAGES', 'ATTACH_FILES']));
  });

  it('should handle users with only the @everyone role', () => {
    const everyoneRole = createMockRole(everyoneRoleId, ['VIEW_CHANNEL'], 0, true);
    const member = createMockMember(user1Id, [everyoneRoleId]);
    const channel = createMockChannel(ChannelType.GUILD_TEXT, [
      { targetType: 'role', targetId: everyoneRoleId, allow: ['ADD_REACTIONS'], deny: [] }
    ]);

    const permissions = calculateEffectivePermissions(member, [], everyoneRole, channel);

    expect(permissions).toEqual(new Set(['VIEW_CHANNEL', 'ADD_REACTIONS']));
  });

  it('should ignore invalid permission strings in data', () => {
    const everyoneRole = createMockRole(everyoneRoleId, ['VIEW_CHANNEL', 'INVALID_PERM'], 0, true);
    const member = createMockMember(user1Id, [everyoneRoleId]);
    const channel = createMockChannel(ChannelType.GUILD_TEXT, [
      { targetType: 'role', targetId: everyoneRoleId, allow: ['SEND_MESSAGES'], deny: ['ANOTHER_INVALID'] }
    ]);

    const permissions = calculateEffectivePermissions(member, [], everyoneRole, channel);

    // Invalid permissions should be filtered out
    expect(permissions).toEqual(new Set(['VIEW_CHANNEL', 'SEND_MESSAGES']));
  });
});
