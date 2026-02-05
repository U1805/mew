import { Server as SocketIOServer, Socket } from 'socket.io';
import Channel from '../api/channel/channel.model';
import ServerMember from '../api/member/member.model';
import Server from '../api/server/server.model';
import Role from '../api/role/role.model';
import { calculateEffectivePermissions } from '../utils/permission.service';

import { createMessage } from '../api/message/message.service';
import { addUserOnline, getOnlineUserIds, removeUserOnline } from './presence.service';

const joinUserRooms = async (socket: Socket) => {
  if (!socket.user) return;

  try {
    const userId = socket.user.id;
    const dmChannels = await Channel.find({ recipients: userId });
    dmChannels.forEach(channel => socket.join(channel._id.toString()));

    const memberships = await ServerMember.find({ userId }).lean();
    const memberServerIds = memberships.map((m: any) => m.serverId).filter(Boolean);

    const serverIds = memberServerIds.map((id: any) => id.toString());
    const [servers, roles, channels] = await Promise.all([
      Server.find({ _id: { $in: memberServerIds } as any }).select('_id everyoneRoleId').lean(),
      Role.find({ serverId: { $in: memberServerIds } as any }).select('_id serverId permissions position').lean(),
      Channel.find({ serverId: { $in: memberServerIds } as any, type: { $in: ['GUILD_TEXT', 'GUILD_WEB'] } })
        .select('_id serverId type permissionOverrides')
        .lean(),
    ]);

    const serverById = new Map<string, any>(servers.map((s: any) => [s._id.toString(), s]));
    const rolesByServerId = new Map<string, any[]>();
    roles.forEach((r: any) => {
      const sid = r.serverId?.toString?.();
      if (!sid) return;
      const arr = rolesByServerId.get(sid) || [];
      arr.push(r);
      rolesByServerId.set(sid, arr);
    });

    const channelsByServerId = new Map<string, any[]>();
    channels.forEach((c: any) => {
      const sid = c.serverId?.toString?.();
      if (!sid) return;
      const arr = channelsByServerId.get(sid) || [];
      arr.push(c);
      channelsByServerId.set(sid, arr);
    });

    const memberByServerId = new Map<string, any>();
    memberships.forEach((m: any) => memberByServerId.set(m.serverId.toString(), m));

    for (const sid of serverIds) {
      socket.join(sid);

      const server = serverById.get(sid);
      const member = memberByServerId.get(sid);
      const serverRoles = rolesByServerId.get(sid) || [];
      const serverChannels = channelsByServerId.get(sid) || [];
      if (!server || !member || !server.everyoneRoleId) continue;

      const everyoneRole = serverRoles.find((r: any) => r._id?.toString?.() === server.everyoneRoleId.toString());
      if (!everyoneRole) continue;

      for (const channel of serverChannels) {
        const perms = calculateEffectivePermissions(member as any, serverRoles as any, everyoneRole as any, channel as any);
        if (perms.has('VIEW_CHANNEL')) {
          socket.join(channel._id.toString());
        }
      }
    }

    socket.join(userId.toString());

    console.log(`User ${socket.user.username} joined rooms for ${dmChannels.length} DMs, ${memberServerIds.length} servers, and personal room.`);

  } catch (error) {
    console.error('Error joining user to rooms:', error);
  }
};

const registerMessageHandlers = (io: SocketIOServer, socket: Socket) => {
  socket.on('message/create', async (data) => {
    try {
      if (!socket.user) return;

      await createMessage({
        ...data,
        authorId: socket.user.id,
      });
    } catch (error) {
      console.error('Error creating message:', error);
      socket.emit('error', { message: 'Failed to create message' });
    }
  });
};

export const registerConnectionHandlers = async (io: SocketIOServer, socket: Socket) => {
  console.log('Authenticated user connected:', socket.id, 'as', socket.user?.username);
  if (!socket.user) return;
  const userId = socket.user.id;

  await joinUserRooms(socket);

  addUserOnline(userId);
  io.emit('PRESENCE_UPDATE', { userId, status: 'online' });
  socket.emit('PRESENCE_INITIAL_STATE', getOnlineUserIds());

  registerMessageHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.user) {
      removeUserOnline(socket.user.id);
      io.emit('PRESENCE_UPDATE', { userId: socket.user.id, status: 'offline' });
    }
  });

  socket.emit('ready');
};
