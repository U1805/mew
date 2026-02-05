import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/channel/channel.model', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('../api/member/member.model', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('../api/server/server.model', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('../api/role/role.model', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('../api/message/message.service', () => ({
  createMessage: vi.fn(),
}));

vi.mock('./presence.service', () => ({
  addUserOnline: vi.fn(),
  removeUserOnline: vi.fn(),
  getOnlineUserIds: vi.fn(() => ['u1']),
}));

import Channel from '../api/channel/channel.model';
import ServerMember from '../api/member/member.model';
import Server from '../api/server/server.model';
import Role from '../api/role/role.model';
import { createMessage } from '../api/message/message.service';
import { addUserOnline, removeUserOnline } from './presence.service';
import { registerConnectionHandlers } from './handlers';

const mkId = (id: string) => ({ toString: () => id });

const makeLeanQuery = <T,>(value: T) => ({
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(value),
});

const makeSelectLeanQuery = <T,>(value: T) => ({
  select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }),
});

const createMockSocket = (user?: { id: string; username: string }) => {
  const handlers = new Map<string, Function>();
  const socket: any = {
    id: 'socket-1',
    user,
    join: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, cb: Function) => {
      handlers.set(event, cb);
    }),
    __handlers: handlers,
  };
  return socket;
};

describe('gateway/handlers registerConnectionHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when socket.user is missing', async () => {
    const io: any = { emit: vi.fn() };
    const socket = createMockSocket(undefined);

    await registerConnectionHandlers(io, socket);

    expect(socket.join).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('joins DM/server rooms and sets up presence + ready', async () => {
    vi.mocked((Channel as any).find)
      .mockResolvedValueOnce([{ _id: mkId('dm1') }, { _id: mkId('dm2') }]) // DMs
      .mockReturnValueOnce(
        makeSelectLeanQuery([{ _id: mkId('c1'), serverId: mkId('s1'), type: 'GUILD_TEXT', permissionOverrides: [] }])
      ); // channels in servers

    vi.mocked((ServerMember as any).find).mockReturnValue(
      makeLeanQuery([
        { serverId: mkId('s1'), userId: mkId('u1'), roleIds: [], isOwner: false },
        { serverId: mkId('s2'), userId: mkId('u1'), roleIds: [], isOwner: false },
      ])
    );

    vi.mocked((Server as any).find).mockReturnValue(
      makeSelectLeanQuery([
        { _id: mkId('s1'), everyoneRoleId: mkId('re1') },
        { _id: mkId('s2'), everyoneRoleId: mkId('re2') },
      ])
    );

    vi.mocked((Role as any).find).mockReturnValue(
      makeSelectLeanQuery([
        { _id: mkId('re1'), serverId: mkId('s1'), permissions: [], position: 0 },
        { _id: mkId('re2'), serverId: mkId('s2'), permissions: [], position: 0 },
      ])
    );

    const io: any = { emit: vi.fn() };
    const socket = createMockSocket({ id: 'u1', username: 'alice' });

    await registerConnectionHandlers(io, socket);

    expect(socket.join).toHaveBeenCalledWith('dm1');
    expect(socket.join).toHaveBeenCalledWith('dm2');
    expect(socket.join).toHaveBeenCalledWith('c1');
    expect(socket.join).toHaveBeenCalledWith('s1');
    expect(socket.join).toHaveBeenCalledWith('s2');
    expect(socket.join).toHaveBeenCalledWith('u1');

    expect(addUserOnline).toHaveBeenCalledWith('u1');
    expect(io.emit).toHaveBeenCalledWith('PRESENCE_UPDATE', { userId: 'u1', status: 'online' });
    expect(socket.emit).toHaveBeenCalledWith('PRESENCE_INITIAL_STATE', ['u1']);
    expect(socket.emit).toHaveBeenCalledWith('ready');
  });

  it('swallows joinUserRooms errors and still sets presence', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked((Channel as any).find).mockRejectedValue(new Error('db down'));
    vi.mocked((ServerMember as any).find).mockReturnValue(makeLeanQuery([]));

    const io: any = { emit: vi.fn() };
    const socket = createMockSocket({ id: 'u1', username: 'alice' });

    await registerConnectionHandlers(io, socket);

    expect(addUserOnline).toHaveBeenCalledWith('u1');
    expect(io.emit).toHaveBeenCalledWith('PRESENCE_UPDATE', { userId: 'u1', status: 'online' });
    expect(socket.emit).toHaveBeenCalledWith('ready');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('handles message/create and injects authorId', async () => {
    vi.mocked((Channel as any).find).mockResolvedValue([]);
    vi.mocked((ServerMember as any).find).mockReturnValue(makeLeanQuery([]));
    vi.mocked(createMessage).mockResolvedValue({} as any);

    const io: any = { emit: vi.fn() };
    const socket = createMockSocket({ id: 'u1', username: 'alice' });

    await registerConnectionHandlers(io, socket);

    const handler = socket.__handlers.get('message/create') as any;
    await handler({ channelId: 'c1', content: 'hi' });

    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'c1', content: 'hi', authorId: 'u1' }));
  });

  it('message/create returns early when socket.user becomes unavailable', async () => {
    vi.mocked((Channel as any).find).mockResolvedValue([]);
    vi.mocked((ServerMember as any).find).mockReturnValue(makeLeanQuery([]));
    vi.mocked(createMessage).mockResolvedValue({} as any);

    const io: any = { emit: vi.fn() };
    const socket = createMockSocket({ id: 'u1', username: 'alice' });

    await registerConnectionHandlers(io, socket);

    const handler = socket.__handlers.get('message/create') as any;
    socket.user = undefined;
    await handler({ channelId: 'c1', content: 'hi' });

    expect(createMessage).not.toHaveBeenCalled();
  });

  it('emits error when message/create fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked((Channel as any).find).mockResolvedValue([]);
    vi.mocked((ServerMember as any).find).mockReturnValue(makeLeanQuery([]));
    vi.mocked(createMessage).mockRejectedValue(new Error('boom'));

    const io: any = { emit: vi.fn() };
    const socket = createMockSocket({ id: 'u1', username: 'alice' });

    await registerConnectionHandlers(io, socket);

    const handler = socket.__handlers.get('message/create') as any;
    await handler({ channelId: 'c1', content: 'hi' });

    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Failed to create message' });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('handles disconnect and broadcasts offline presence', async () => {
    vi.mocked((Channel as any).find).mockResolvedValue([]);
    vi.mocked((ServerMember as any).find).mockResolvedValue([]);

    const io: any = { emit: vi.fn() };
    const socket = createMockSocket({ id: 'u1', username: 'alice' });

    await registerConnectionHandlers(io, socket);

    const onDisconnect = socket.__handlers.get('disconnect') as any;
    onDisconnect();

    expect(removeUserOnline).toHaveBeenCalledWith('u1');
    expect(io.emit).toHaveBeenCalledWith('PRESENCE_UPDATE', { userId: 'u1', status: 'offline' });
  });

  it('disconnect does nothing when socket.user is missing', async () => {
    vi.mocked((Channel as any).find).mockResolvedValue([]);
    vi.mocked((ServerMember as any).find).mockResolvedValue([]);

    const io: any = { emit: vi.fn() };
    const socket = createMockSocket({ id: 'u1', username: 'alice' });

    await registerConnectionHandlers(io, socket);

    const onDisconnect = socket.__handlers.get('disconnect') as any;
    socket.user = undefined;
    onDisconnect();

    expect(removeUserOnline).not.toHaveBeenCalled();
  });
});
