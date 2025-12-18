import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';

vi.mock('./channel.repository', () => ({
  channelRepository: {
    findById: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    createDmChannel: vi.fn(),
  },
}));

vi.mock('../category/category.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcast: vi.fn(),
    broadcastToUser: vi.fn(),
  },
}));

vi.mock('../member/member.model', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock('../server/server.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../role/role.model', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('../../utils/permission.service', () => ({
  calculateEffectivePermissions: vi.fn(),
  syncUserChannelPermissions: vi.fn(),
}));

import channelService from './channel.service';
import { channelRepository } from './channel.repository';
import Category from '../category/category.model';
import ServerMember from '../member/member.model';
import Server from '../server/server.model';
import Role from '../role/role.model';
import { socketManager } from '../../gateway/events';
import { calculateEffectivePermissions } from '../../utils/permission.service';

const mkId = (value: string) => ({
  toString: () => value,
  equals: (other: any) => other === value || other?.toString?.() === value,
});

describe('channel.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createDmChannel rejects creating a DM with yourself', async () => {
    await expect(channelService.createDmChannel('u1', 'u1')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('updateChannel throws NotFoundError when channel does not exist', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue(null);
    await expect(channelService.updateChannel('c1', { name: 'x' } as any)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updateChannel rejects operations on DM channels', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue({ serverId: null } as any);
    await expect(channelService.updateChannel('c1', { name: 'x' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('updateChannel rejects when category belongs to a different server', async () => {
    const channel: any = { serverId: mkId('s1'), categoryId: null, name: 'old', topic: '' };
    vi.mocked(channelRepository.findById).mockResolvedValue(channel);
    vi.mocked((Category as any).findById).mockResolvedValue({ serverId: mkId('s2') });

    await expect(channelService.updateChannel('c1', { categoryId: 'cat1' } as any)).rejects.toBeInstanceOf(
      BadRequestError
    );
  });

  it('updatePermissionOverrides prevents self-lockout for non-exempt members', async () => {
    const channel: any = {
      _id: mkId('c1'),
      serverId: mkId('s1'),
      permissionOverrides: [],
      toObject: () => ({ _id: 'c1', serverId: mkId('s1'), permissionOverrides: [] }),
    };
    vi.mocked(channelRepository.findById).mockResolvedValue(channel);
    vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: false, roleIds: [mkId('r1')], userId: mkId('u1') });
    vi.mocked((Server as any).findById).mockResolvedValue({ everyoneRoleId: mkId('r0') });
    vi.mocked((Role as any).find).mockResolvedValue([
      { _id: mkId('r0'), permissions: [] },
      { _id: mkId('r1'), permissions: [] },
    ]);
    vi.mocked(calculateEffectivePermissions as any).mockReturnValue(new Set());

    await expect(channelService.updatePermissionOverrides('c1', [{ x: 1 }], 'u1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('updatePermissionOverrides allows exempt owners and broadcasts PERMISSIONS_UPDATE', async () => {
    const channel: any = {
      _id: mkId('c1'),
      serverId: mkId('s1'),
      permissionOverrides: [],
      toObject: () => ({ _id: 'c1', serverId: mkId('s1'), permissionOverrides: [] }),
    };
    vi.mocked(channelRepository.findById).mockResolvedValue(channel);
    vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: true, roleIds: [], userId: mkId('u1') });
    vi.mocked((ServerMember as any).find).mockResolvedValue([]);
    vi.mocked(channelRepository.save).mockResolvedValue(channel);

    const overrides = [{ targetType: 'role', targetId: 'r0', allow: [], deny: [] }];
    const result = await channelService.updatePermissionOverrides('c1', overrides as any, 'u1');

    expect(channel.permissionOverrides).toEqual(overrides);
    expect(channelRepository.save).toHaveBeenCalled();
    expect(socketManager.broadcast).toHaveBeenCalledWith('PERMISSIONS_UPDATE', 's1', { serverId: 's1', channelId: 'c1' });
    expect(result).toEqual(overrides);
  });
});

