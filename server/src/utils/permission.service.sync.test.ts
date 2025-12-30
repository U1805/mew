import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../gateway/events', () => ({ socketManager: {} }));

vi.mock('../api/member/member.model', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock('../api/channel/channel.model', () => ({
  default: {
    findById: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock('../api/server/server.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../api/role/role.model', () => ({
  default: {
    find: vi.fn(),
  },
}));

import ServerMember from '../api/member/member.model';
import Channel from '../api/channel/channel.model';
import Server from '../api/server/server.model';
import Role from '../api/role/role.model';

describe('utils/permission.service (sync helpers)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncUsersPermissionsForServerChannels returns early when userIds is empty', async () => {
    const mod = await import('./permission.service');
    await expect(mod.syncUsersPermissionsForServerChannels({ serverId: 's1', userIds: [] })).resolves.toBeUndefined();
    expect((Server as any).findById).not.toHaveBeenCalled();
  });

  it('syncUsersPermissionsForServerChannels batches members and iterates channels', async () => {
    (Server as any).findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ everyoneRoleId: 'r0' }),
      }),
    });

    (Role as any).find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: 'r0', permissions: [], position: 0 },
          { _id: 'r1', permissions: ['SEND_MESSAGES'], position: 1 },
        ]),
      }),
    });

    (Channel as any).find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { type: 'GUILD_TEXT', permissionOverrides: [] },
          { type: 'DM', permissionOverrides: [] },
        ]),
      }),
    });

    (ServerMember as any).find
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue([{ userId: 'u1', roleIds: ['r0', 'r1'], isOwner: false }]),
      })
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue([{ userId: 'u2', roleIds: ['r0'], isOwner: false }]),
      });

    const mod = await import('./permission.service');
    await expect(
      mod.syncUsersPermissionsForServerChannels({ serverId: 's1', userIds: ['u1', '', 'u1', 'u2'], userBatchSize: 1 })
    ).resolves.toBeUndefined();

    expect((Server as any).findById).toHaveBeenCalledTimes(1);
    expect((Role as any).find).toHaveBeenCalledTimes(1);
    expect((Channel as any).find).toHaveBeenCalledTimes(1);
    expect((ServerMember as any).find).toHaveBeenCalledTimes(2);
  });

  it('syncUserPermissionsForServerChannels iterates channels when member and server exist', async () => {
    (ServerMember as any).findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ userId: 'u1', roleIds: ['r0'], isOwner: false }),
    });

    (Server as any).findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ everyoneRoleId: 'r0' }),
      }),
    });

    (Role as any).find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: 'r0', permissions: [], position: 0 }]),
      }),
    });

    (Channel as any).find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ type: 'GUILD_TEXT', permissionOverrides: [] }]),
      }),
    });

    const mod = await import('./permission.service');
    await expect(mod.syncUserPermissionsForServerChannels('u1', 's1')).resolves.toBeUndefined();
    expect((Channel as any).find).toHaveBeenCalledTimes(1);
  });

  it('syncUsersPermissionsForChannel batches members when channel exists', async () => {
    (Channel as any).findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ type: 'GUILD_TEXT', serverId: 's1', permissionOverrides: [] }),
      }),
    });

    (Server as any).findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ everyoneRoleId: 'r0' }),
      }),
    });

    (Role as any).find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: 'r0', permissions: [], position: 0 }]),
      }),
    });

    (ServerMember as any).find
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue([{ userId: 'u1', roleIds: ['r0'], isOwner: false }]),
      })
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue([{ userId: 'u2', roleIds: ['r0'], isOwner: false }]),
      });

    const mod = await import('./permission.service');
    await expect(
      mod.syncUsersPermissionsForChannel({ channelId: 'c1', userIds: ['u1', 'u2', 'u2'], userBatchSize: 1 })
    ).resolves.toBeUndefined();

    expect((Channel as any).findById).toHaveBeenCalledTimes(1);
    expect((ServerMember as any).find).toHaveBeenCalledTimes(2);
  });

  it('syncUserChannelPermissions returns early when channel is not a server channel', async () => {
    (Channel as any).findById.mockResolvedValue({ type: 'GUILD_TEXT', serverId: null });

    const mod = await import('./permission.service');
    await expect(mod.syncUserChannelPermissions('u1', 'c1')).resolves.toBeUndefined();

    expect((Server as any).findById).not.toHaveBeenCalled();
    expect((ServerMember as any).findOne).not.toHaveBeenCalled();
  });

  it('syncUserChannelPermissions calculates permissions when data exists', async () => {
    (Channel as any).findById.mockResolvedValue({ type: 'GUILD_TEXT', serverId: 's1', permissionOverrides: [] });
    (Server as any).findById.mockResolvedValue({ everyoneRoleId: 'r0' });
    (ServerMember as any).findOne.mockResolvedValue({ userId: 'u1', roleIds: ['r0'], isOwner: false });
    (Role as any).find.mockResolvedValue([{ _id: 'r0', permissions: [], position: 0 }]);

    const mod = await import('./permission.service');
    await expect(mod.syncUserChannelPermissions('u1', 'c1')).resolves.toBeUndefined();

    expect((Role as any).find).toHaveBeenCalledTimes(1);
    expect((ServerMember as any).findOne).toHaveBeenCalledTimes(1);
  });
});
