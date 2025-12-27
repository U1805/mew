import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

const id = () => new Types.ObjectId();

const makeLeanQuery = <T,>(data: T) => ({
  select: () => makeLeanQuery(data),
  lean: async () => data,
});

describe('utils/permission.service (sync functions)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('syncUserChannelPermissions returns early for missing channel/server/member', async () => {
    const Channel = { findById: vi.fn().mockResolvedValue(null) };
    vi.doMock('../api/channel/channel.model', () => ({ default: Channel }));
    vi.doMock('../api/server/server.model', () => ({ default: { findById: vi.fn() } }));
    vi.doMock('../api/member/member.model', () => ({ default: { findOne: vi.fn() } }));
    vi.doMock('../api/role/role.model', () => ({ default: { find: vi.fn() } }));
    vi.doMock('../gateway/events', () => ({ socketManager: {} }));

    const mod = await import('./permission.service');
    await expect(mod.syncUserChannelPermissions('u', 'c')).resolves.toBeUndefined();
    expect(Channel.findById).toHaveBeenCalledWith('c');
  });

  it('syncUserPermissionsForServerChannels iterates channels and does not throw', async () => {
    const everyoneRoleId = id();
    const serverId = id().toHexString();
    const userId = id().toHexString();

    vi.doMock('../api/member/member.model', () => ({
      default: { findOne: vi.fn().mockReturnValue(makeLeanQuery({ userId, roleIds: [everyoneRoleId], isOwner: false })) },
    }));
    vi.doMock('../api/server/server.model', () => ({
      default: { findById: vi.fn().mockReturnValue(makeLeanQuery({ everyoneRoleId })) },
    }));
    vi.doMock('../api/role/role.model', () => ({
      default: {
        find: vi.fn().mockReturnValue(
          makeLeanQuery([
            { _id: everyoneRoleId, permissions: ['VIEW_CHANNEL'], position: 0 },
            { _id: id(), permissions: ['SEND_MESSAGES'], position: 1 },
          ])
        ),
      },
    }));
    vi.doMock('../api/channel/channel.model', () => ({
      default: {
        find: vi.fn().mockReturnValue(
          makeLeanQuery([
            { type: 'GUILD_TEXT', permissionOverrides: [] },
            { type: 'GUILD_TEXT', permissionOverrides: [] },
          ])
        ),
      },
    }));
    vi.doMock('../gateway/events', () => ({ socketManager: {} }));

    const mod = await import('./permission.service');
    await expect(mod.syncUserPermissionsForServerChannels(userId, serverId)).resolves.toBeUndefined();
  });

  it('syncUsersPermissionsForServerChannels batches userIds and iterates members/channels', async () => {
    const everyoneRoleId = id();
    const serverId = id().toHexString();
    const userA = id().toHexString();
    const userB = id().toHexString();

    const findMembers = vi.fn().mockReturnValue(
      makeLeanQuery([
        { userId: userA, roleIds: [everyoneRoleId], isOwner: false },
        { userId: userB, roleIds: [everyoneRoleId], isOwner: false },
      ])
    );

    vi.doMock('../api/member/member.model', () => ({ default: { find: findMembers } }));
    vi.doMock('../api/server/server.model', () => ({
      default: { findById: vi.fn().mockReturnValue(makeLeanQuery({ everyoneRoleId })) },
    }));
    vi.doMock('../api/role/role.model', () => ({
      default: { find: vi.fn().mockReturnValue(makeLeanQuery([{ _id: everyoneRoleId, permissions: ['VIEW_CHANNEL'], position: 0 }])) },
    }));
    vi.doMock('../api/channel/channel.model', () => ({
      default: { find: vi.fn().mockReturnValue(makeLeanQuery([{ type: 'GUILD_TEXT', permissionOverrides: [] }])) },
    }));
    vi.doMock('../gateway/events', () => ({ socketManager: {} }));

    const mod = await import('./permission.service');

    await expect(
      mod.syncUsersPermissionsForServerChannels({ serverId, userIds: [userA, userB], userBatchSize: 1 })
    ).resolves.toBeUndefined();

    expect(findMembers).toHaveBeenCalled();
  });

  it('syncUsersPermissionsForChannel returns early when channel has no serverId', async () => {
    vi.doMock('../api/channel/channel.model', () => ({
      default: { findById: vi.fn().mockReturnValue(makeLeanQuery({ type: 'GUILD_TEXT', serverId: null })) },
    }));
    vi.doMock('../api/server/server.model', () => ({ default: { findById: vi.fn() } }));
    vi.doMock('../api/role/role.model', () => ({ default: { find: vi.fn() } }));
    vi.doMock('../api/member/member.model', () => ({ default: { find: vi.fn() } }));
    vi.doMock('../gateway/events', () => ({ socketManager: {} }));

    const mod = await import('./permission.service');
    await expect(mod.syncUsersPermissionsForChannel({ channelId: 'c', userIds: ['u'] })).resolves.toBeUndefined();
  });
});

