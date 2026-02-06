import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcast: vi.fn(),
  },
}));

vi.mock('../../utils/s3', () => ({
  getS3PublicUrl: vi.fn((key: string) => `http://cdn.local/${key}`),
}));

vi.mock('./server.repository', () => ({
  serverRepository: {
    findById: vi.fn(),
    findServersByUserId: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock('../channel/channel.model', () => ({
  default: {
    find: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../message/message.model', () => ({
  default: {
    deleteMany: vi.fn(),
  },
}));

vi.mock('../member/member.model', () => ({
  default: {
    deleteMany: vi.fn(),
  },
}));

vi.mock('../role/role.model', () => ({
  default: {
    deleteMany: vi.fn(),
  },
}));

vi.mock('../webhook/webhook.model', () => ({
  Webhook: {
    deleteMany: vi.fn(),
  },
}));

import serverService from './server.service';
import { serverRepository } from './server.repository';
import Channel from '../channel/channel.model';
import Message from '../message/message.model';
import ServerMember from '../member/member.model';
import Role from '../role/role.model';
import { Webhook } from '../webhook/webhook.model';
import { socketManager } from '../../gateway/events';
import { NotFoundError } from '../../utils/errors';

describe('server.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateServer hydrates avatarUrl and broadcasts update', async () => {
    const doc: any = { toObject: () => ({ _id: 's1', name: 'S', avatarUrl: 'icon.png' }) };
    vi.mocked(serverRepository.updateById).mockResolvedValue(doc);

    const result: any = await serverService.updateServer('s1', { name: 'S2' } as any);

    expect(result.avatarUrl).toBe('http://cdn.local/icon.png');
    expect(socketManager.broadcast).toHaveBeenCalledWith('SERVER_UPDATE', 's1', expect.objectContaining({ _id: 's1' }));
  });

  it('getServerById throws when server does not exist', async () => {
    vi.mocked(serverRepository.findById).mockResolvedValue(null as any);
    await expect(serverService.getServerById('s1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getServerById hydrates avatarUrl when present', async () => {
    vi.mocked(serverRepository.findById).mockResolvedValue({ toObject: () => ({ _id: 's1', avatarUrl: 'x.png' }) } as any);
    const result: any = await serverService.getServerById('s1');
    expect(result.avatarUrl).toBe('http://cdn.local/x.png');
  });

  it('getServersForUser hydrates avatarUrl and leaves empty avatar unchanged', async () => {
    vi.mocked((serverRepository as any).findServersByUserId).mockResolvedValue([
      { toObject: () => ({ _id: 's1', avatarUrl: 'a.png' }) },
      { toObject: () => ({ _id: 's2' }) },
    ]);
    const result: any = await serverService.getServersForUser('u1');
    expect(result[0].avatarUrl).toBe('http://cdn.local/a.png');
    expect(result[1].avatarUrl).toBeUndefined();
  });

  it('deleteServer deletes related data and broadcasts delete', async () => {
    vi.mocked(serverRepository.findById).mockResolvedValue({ toObject: () => ({ _id: 's1' }) } as any);
    vi.mocked((Channel as any).find).mockResolvedValue([{ _id: 'c1' }, { _id: 'c2' }]);

    const result: any = await serverService.deleteServer('s1');

    expect(Message.deleteMany).toHaveBeenCalledWith({ channelId: { $in: ['c1', 'c2'] } });
    expect(Channel.deleteMany).toHaveBeenCalledWith({ serverId: 's1' as any });
    expect(ServerMember.deleteMany).toHaveBeenCalledWith({ serverId: 's1' as any });
    expect(Webhook.deleteMany).toHaveBeenCalledWith({ serverId: 's1' as any });
    expect(Role.deleteMany).toHaveBeenCalledWith({ serverId: 's1' as any });
    expect(serverRepository.deleteById).toHaveBeenCalledWith('s1');
    expect(socketManager.broadcast).toHaveBeenCalledWith('SERVER_DELETE', 's1', { serverId: 's1' });
    expect(result.message).toContain('deleted');
  });

  it('deleteServer skips message deletion when server has no channels', async () => {
    vi.mocked(serverRepository.findById).mockResolvedValue({ toObject: () => ({ _id: 's1' }) } as any);
    vi.mocked((Channel as any).find).mockResolvedValue([]);

    await serverService.deleteServer('s1');

    expect(Message.deleteMany).not.toHaveBeenCalled();
  });

  it('updateServerIcon delegates to updateServer', async () => {
    const spy = vi.spyOn(serverService, 'updateServer').mockResolvedValue({ _id: 's1' } as any);
    await serverService.updateServerIcon('s1', 'icon.png');
    expect(spy).toHaveBeenCalledWith('s1', { avatarUrl: 'icon.png' });
    spy.mockRestore();
  });
});

