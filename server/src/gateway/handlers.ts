import { Server as SocketIOServer, Socket } from 'socket.io';
import Channel from '../api/channel/channel.model';
import ServerMember from '../api/member/member.model';

import { createMessage } from '../api/message/message.service';
import { addUserOnline, getOnlineUserIds, removeUserOnline } from './presence.service';

const joinUserRooms = async (socket: Socket) => {
  if (!socket.user) return;

  try {
    const userId = socket.user.id;
    const dmChannels = await Channel.find({ recipients: userId });
    dmChannels.forEach(channel => socket.join(channel._id.toString()));

    const memberships = await ServerMember.find({ userId });
    const memberServerIds = memberships.map(m => m.serverId);

    const channelsInUserServers = await Channel.find({ serverId: { $in: memberServerIds } });
    channelsInUserServers.forEach(channel => socket.join(channel._id.toString()));

    memberServerIds.forEach(serverId => socket.join(serverId.toString()));

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
