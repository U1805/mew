import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../utils/errors';

vi.mock('./channel.service', () => ({
  default: {
    createChannel: vi.fn(),
    getChannelById: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    getChannelsByServer: vi.fn(),
    getPermissionOverrides: vi.fn(),
    updatePermissionOverrides: vi.fn(),
  },
}));

vi.mock('./readState.service', () => ({
  default: {
    ackChannel: vi.fn(),
  },
}));

vi.mock('../server/server.service', () => ({
  default: {
    getServerById: vi.fn(),
  },
}));

import channelService from './channel.service';
import readStateService from './readState.service';
import serverService from '../server/server.service';
import {
  ackChannelHandler,
  createChannelHandler,
  deleteChannelHandler,
  getChannelHandler,
  getChannelsHandler,
  getPermissionOverridesHandler,
  updateChannelHandler,
  updatePermissionOverridesHandler,
} from './channel.controller';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('channel.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createChannelHandler passes UnauthorizedError when req.user missing', async () => {
    const req: any = { params: { serverId: 's1' }, body: { name: 'c' } };
    const res = makeRes();
    const next = vi.fn();

    await createChannelHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('createChannelHandler passes NotFoundError when server not found', async () => {
    vi.mocked(serverService.getServerById).mockResolvedValue(null as any);
    const req: any = { params: { serverId: 's1' }, user: { id: 'u1' }, body: { name: 'c' } };
    const res = makeRes();
    const next = vi.fn();

    await createChannelHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
  });

  it('createChannelHandler returns 201 with created channel', async () => {
    vi.mocked(serverService.getServerById).mockResolvedValue({ _id: 's1' } as any);
    vi.mocked(channelService.createChannel).mockResolvedValue({ _id: 'c1' } as any);

    const req: any = { params: { serverId: 's1' }, user: { id: 'u1' }, body: { name: 'general' } };
    const res = makeRes();
    const next = vi.fn();

    await createChannelHandler(req, res, next);

    expect(channelService.createChannel).toHaveBeenCalledWith(expect.objectContaining({ name: 'general', serverId: 's1' }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ _id: 'c1' });
  });

  it('updateChannelHandler passes BadRequestError for DM channels', async () => {
    vi.mocked(channelService.getChannelById).mockResolvedValue({ _id: 'c1', serverId: null } as any);
    const req: any = { params: { channelId: 'c1' }, user: { id: 'u1' }, body: { name: 'x' } };
    const res = makeRes();
    const next = vi.fn();

    await updateChannelHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
  });

  it('deleteChannelHandler passes NotFoundError when channel missing', async () => {
    vi.mocked(channelService.getChannelById).mockResolvedValue(null as any);
    const req: any = { params: { channelId: 'c1' }, user: { id: 'u1' } };
    const res = makeRes();
    const next = vi.fn();

    await deleteChannelHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
  });

  it('getChannelsHandler passes UnauthorizedError when unauthenticated', async () => {
    const req: any = { params: { serverId: 's1' } };
    const res = makeRes();
    const next = vi.fn();

    await getChannelsHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('getPermissionOverridesHandler returns 200', async () => {
    vi.mocked(channelService.getPermissionOverrides).mockResolvedValue([{ allow: [] }] as any);
    const req: any = { params: { channelId: 'c1' } };
    const res = makeRes();
    const next = vi.fn();

    await getPermissionOverridesHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ allow: [] }]);
  });

  it('updatePermissionOverridesHandler passes UnauthorizedError when unauthenticated', async () => {
    const req: any = { params: { channelId: 'c1' }, body: [] };
    const res = makeRes();
    const next = vi.fn();

    await updatePermissionOverridesHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('ackChannelHandler returns 204 and calls readStateService', async () => {
    const req: any = { params: { channelId: 'c1' }, user: { id: 'u1' }, body: { lastMessageId: 'm1' } };
    const res = makeRes();
    const next = vi.fn();

    await ackChannelHandler(req, res, next);

    expect(readStateService.ackChannel).toHaveBeenCalledWith('u1', 'c1', 'm1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('getChannelHandler passes UnauthorizedError when unauthenticated', async () => {
    const req: any = { params: { channelId: 'c1' } };
    const res = makeRes();
    const next = vi.fn();

    await getChannelHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });
});

