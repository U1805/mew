import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';

vi.mock('./channel.repository', () => ({
  channelRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
    deleteById: vi.fn(),
    findVisibleChannelsForUser: vi.fn(),
    findDmChannelsByUser: vi.fn(),
    findByIdWithOverrides: vi.fn(),
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
    deleteMany: vi.fn(),
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
  syncUsersPermissionsForChannel: vi.fn(),
}));

vi.mock('../message/message.model', () => ({
  default: {
    deleteMany: vi.fn(),
  },
}));

vi.mock('../webhook/webhook.model', () => ({
  Webhook: {
    deleteMany: vi.fn(),
  },
}));

vi.mock('../../utils/s3', () => ({
  getS3PublicUrl: vi.fn((k: string) => `http://cdn.local/${k}`),
}));

vi.mock('../user/user.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../bot/bot.model', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

import channelService from './channel.service';
import { channelRepository } from './channel.repository';
import Category from '../category/category.model';
import ServerMember from '../member/member.model';
import Server from '../server/server.model';
import Role from '../role/role.model';
import { socketManager } from '../../gateway/events';
import Message from '../message/message.model';
import { Webhook } from '../webhook/webhook.model';
import UserModel from '../user/user.model';
import BotModel from '../bot/bot.model';
import { calculateEffectivePermissions, syncUsersPermissionsForChannel } from '../../utils/permission.service';

const mkId = (value: string) => ({
  toString: () => value,
  equals: (other: any) => other === value || other?.toString?.() === value,
});

describe('channel.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createChannel delegates to repository', async () => {
    vi.mocked(channelRepository.create).mockResolvedValue({ _id: mkId('c1') } as any);
    const result = await channelService.createChannel({ name: 'x' } as any);
    expect(channelRepository.create).toHaveBeenCalled();
    expect((result as any)._id.toString()).toBe('c1');
  });

  it('getChannelById delegates to repository', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue({ _id: mkId('c1') } as any);
    const result = await channelService.getChannelById('c1');
    expect(channelRepository.findById).toHaveBeenCalledWith('c1');
    expect((result as any)._id.toString()).toBe('c1');
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

    await expect(channelService.updateChannel('c1', { categoryId: 'cat1' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('updateChannel rejects when category does not exist', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue({ serverId: mkId('s1') } as any);
    vi.mocked((Category as any).findById).mockResolvedValue(null);
    await expect(channelService.updateChannel('c1', { categoryId: 'cat1' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('updateChannel rejects url update for non-web channels', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue({ serverId: mkId('s1'), type: 'GUILD_TEXT' } as any);
    await expect(channelService.updateChannel('c1', { url: 'https://x' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('updateChannel updates topic/url and broadcasts for web channels', async () => {
    const channel: any = { _id: mkId('c1'), serverId: mkId('s1'), type: 'GUILD_WEB', topic: 'a', url: '' };
    vi.mocked(channelRepository.findById).mockResolvedValue(channel);
    vi.mocked(channelRepository.save).mockResolvedValue(channel);

    const result: any = await channelService.updateChannel('c1', { topic: '', url: 'https://x' } as any);
    expect(result.topic).toBe('');
    expect(result.url).toBe('https://x');
    expect(socketManager.broadcast).toHaveBeenCalledWith('CHANNEL_UPDATE', 's1', channel);
  });

  it('deleteChannel throws when channel is missing', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue(null);
    await expect(channelService.deleteChannel('c1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deleteChannel cascades deletes and broadcasts when serverId exists', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue({ _id: mkId('c1'), serverId: mkId('s1') } as any);
    vi.mocked(channelRepository.deleteById).mockResolvedValue({ _id: mkId('c1'), serverId: mkId('s1') } as any);

    await channelService.deleteChannel('c1');
    expect(Message.deleteMany).toHaveBeenCalledWith({ channelId: 'c1' });
    expect(Webhook.deleteMany).toHaveBeenCalledWith({ channelId: 'c1' });
    expect(socketManager.broadcast).toHaveBeenCalledWith('CHANNEL_DELETE', 's1', { channelId: 'c1', serverId: 's1' });
  });

  it('getChannelsByServer throws Forbidden when member is missing', async () => {
    vi.mocked((ServerMember as any).findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    vi.mocked((Server as any).findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) });
    vi.mocked((Role as any).find).mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: mkId('r0') }]) });
    vi.mocked(channelRepository.findVisibleChannelsForUser).mockResolvedValue([] as any);

    await expect(channelService.getChannelsByServer('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('getChannelsByServer throws NotFound when server is missing', async () => {
    vi.mocked((ServerMember as any).findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [] }) });
    vi.mocked((Server as any).findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    vi.mocked((Role as any).find).mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: mkId('r0') }]) });
    vi.mocked(channelRepository.findVisibleChannelsForUser).mockResolvedValue([] as any);

    await expect(channelService.getChannelsByServer('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getChannelsByServer throws when everyone role is missing', async () => {
    vi.mocked((ServerMember as any).findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [] }) });
    vi.mocked((Server as any).findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) });
    vi.mocked((Role as any).find).mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: mkId('r1') }]) });
    vi.mocked(channelRepository.findVisibleChannelsForUser).mockResolvedValue([] as any);

    await expect(channelService.getChannelsByServer('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getChannelsByServer filters channels by VIEW_CHANNEL permission', async () => {
    vi.mocked((ServerMember as any).findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [mkId('r0')] }) });
    vi.mocked((Server as any).findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) });
    vi.mocked((Role as any).find).mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: mkId('r0'), permissions: [] }]) });
    vi.mocked(channelRepository.findVisibleChannelsForUser).mockResolvedValue([{ _id: 'c1' }, { _id: 'c2' }] as any);
    vi.mocked(calculateEffectivePermissions as any)
      .mockReturnValueOnce(new Set(['VIEW_CHANNEL', 'SEND_MESSAGES']))
      .mockReturnValueOnce(new Set(['SEND_MESSAGES']));

    const result: any = await channelService.getChannelsByServer('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012');
    expect(result).toHaveLength(1);
    expect(result[0].permissions).toContain('VIEW_CHANNEL');
  });

  it('createDmChannel returns existing DM if already present', async () => {
    vi.mocked(channelRepository.findOne).mockResolvedValue({ _id: mkId('c1') } as any);
    const result: any = await channelService.createDmChannel('u1', 'u2');
    expect(result._id.toString()).toBe('c1');
    expect(channelRepository.createDmChannel).not.toHaveBeenCalled();
  });

  it('createDmChannel throws when recipient is missing', async () => {
    vi.mocked(channelRepository.findOne).mockResolvedValue(null);
    vi.mocked((UserModel as any).findById).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    await expect(channelService.createDmChannel('u1', 'u2')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('createDmChannel blocks bot recipients with dmEnabled=false', async () => {
    vi.mocked(channelRepository.findOne).mockResolvedValue(null);
    vi.mocked((UserModel as any).findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: mkId('u2'), isBot: true }) }),
    });
    vi.mocked((BotModel as any).findOne).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ dmEnabled: false }) }) });
    await expect(channelService.createDmChannel('u1', 'u2')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('createDmChannel creates DM, hydrates avatars and broadcasts', async () => {
    vi.mocked(channelRepository.findOne).mockResolvedValue(null);
    vi.mocked((UserModel as any).findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: mkId('u2'), isBot: false }) }),
    });
    const created: any = {
      recipients: [{ avatarUrl: 'a.png' }, { avatarUrl: '' }],
      populate: vi.fn(),
    };
    created.populate.mockResolvedValue(created);
    vi.mocked(channelRepository.createDmChannel).mockResolvedValue(created);

    const result: any = await channelService.createDmChannel('u1', 'u2');
    expect(result.recipients[0].avatarUrl).toBe('http://cdn.local/a.png');
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u2', 'DM_CHANNEL_CREATE', created);
  });

  it('getDmChannelsByUser hydrates avatars', async () => {
    vi.mocked(channelRepository.findDmChannelsByUser).mockResolvedValue([{ recipients: [{ avatarUrl: 'x.png' }] }] as any);
    const result: any = await channelService.getDmChannelsByUser('507f1f77bcf86cd799439011');
    expect(result[0].recipients[0].avatarUrl).toBe('http://cdn.local/x.png');
  });

  it('getPermissionOverrides throws when channel is missing', async () => {
    vi.mocked(channelRepository.findByIdWithOverrides).mockResolvedValue(null);
    await expect(channelService.getPermissionOverrides('c1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getPermissionOverrides returns overrides', async () => {
    vi.mocked(channelRepository.findByIdWithOverrides).mockResolvedValue({ permissionOverrides: [{ a: 1 }] } as any);
    const result = await channelService.getPermissionOverrides('c1');
    expect(result).toEqual([{ a: 1 }]);
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

  it('updatePermissionOverrides throws when channel does not exist', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue(null);
    await expect(channelService.updatePermissionOverrides('c1', [], 'u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updatePermissionOverrides rejects DM channels', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue({ serverId: null } as any);
    await expect(channelService.updatePermissionOverrides('c1', [], 'u1')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('updatePermissionOverrides throws when member is missing', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue({ serverId: mkId('s1') } as any);
    vi.mocked((ServerMember as any).findOne).mockResolvedValue(null);
    vi.mocked((Server as any).findById).mockResolvedValue({ everyoneRoleId: mkId('r0') });
    vi.mocked((Role as any).find).mockResolvedValue([{ _id: mkId('r0'), permissions: [] }]);
    await expect(channelService.updatePermissionOverrides('c1', [], 'u1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('updatePermissionOverrides throws when server is missing', async () => {
    vi.mocked(channelRepository.findById).mockResolvedValue({ serverId: mkId('s1') } as any);
    vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: false, roleIds: [mkId('r0')] });
    vi.mocked((Server as any).findById).mockResolvedValue(null);
    vi.mocked((Role as any).find).mockResolvedValue([{ _id: mkId('r0'), permissions: [] }]);
    await expect(channelService.updatePermissionOverrides('c1', [], 'u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updatePermissionOverrides throws when @everyone role is missing for non-exempt user', async () => {
    const channel: any = { serverId: mkId('s1'), toObject: () => ({ permissionOverrides: [] }) };
    vi.mocked(channelRepository.findById).mockResolvedValue(channel);
    vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: false, roleIds: [mkId('r1')] });
    vi.mocked((Server as any).findById).mockResolvedValue({ everyoneRoleId: mkId('r0') });
    vi.mocked((Role as any).find).mockResolvedValue([{ _id: mkId('r1'), permissions: [] }]);

    await expect(channelService.updatePermissionOverrides('c1', [], 'u1')).rejects.toBeInstanceOf(NotFoundError);
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
    vi.mocked((ServerMember as any).find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });
    vi.mocked(channelRepository.save).mockResolvedValue(channel);

    const overrides = [{ targetType: 'role', targetId: 'r0', allow: [], deny: [] }];
    const result = await channelService.updatePermissionOverrides('c1', overrides as any, 'u1');

    expect(channel.permissionOverrides).toEqual(overrides);
    expect(channelRepository.save).toHaveBeenCalled();
    expect(socketManager.broadcast).toHaveBeenCalledWith('PERMISSIONS_UPDATE', 's1', { serverId: 's1', channelId: 'c1' });
    expect(result).toEqual(overrides);
  });

  it('updatePermissionOverrides treats ADMINISTRATOR role as exempt and skips self-lockout simulation', async () => {
    const channel: any = { serverId: mkId('s1'), permissionOverrides: [], toObject: () => ({ permissionOverrides: [] }) };
    vi.mocked(channelRepository.findById).mockResolvedValue(channel);
    vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: false, roleIds: [mkId('r1')] });
    vi.mocked((Server as any).findById).mockResolvedValue({ everyoneRoleId: mkId('r0') });
    vi.mocked((Role as any).find).mockResolvedValue([
      { _id: mkId('r0'), permissions: [] },
      { _id: mkId('r1'), permissions: ['ADMINISTRATOR'] },
    ]);
    vi.mocked((ServerMember as any).find).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

    await channelService.updatePermissionOverrides('c1', [], 'u1');
    expect(calculateEffectivePermissions).not.toHaveBeenCalled();
  });

  it('updatePermissionOverrides logs and swallows async permission-sync errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const channel: any = { serverId: mkId('s1'), permissionOverrides: [], toObject: () => ({ permissionOverrides: [] }) };
    vi.mocked(channelRepository.findById).mockResolvedValue(channel);
    vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: true, roleIds: [] });
    vi.mocked((Server as any).findById).mockResolvedValue({ everyoneRoleId: mkId('r0') });
    vi.mocked((Role as any).find).mockResolvedValue([{ _id: mkId('r0'), permissions: [] }]);
    vi.mocked((ServerMember as any).find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ userId: mkId('u1') }]),
      }),
    });
    vi.mocked(syncUsersPermissionsForChannel as any).mockRejectedValue(new Error('sync failed'));

    await channelService.updatePermissionOverrides('c1', [], 'u1');
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
