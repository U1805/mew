import { Server as SocketIOServer, Socket } from 'socket.io';
import Channel from '../api/channel/channel.model';
import ServerMember from '../api/member/member.model';

import { createMessage } from '../api/message/message.service';

const joinUserRooms = async (socket: Socket) => {
  if (!socket.user) return;

  try {
    const userId = socket.user.id;

    // 1. Join all DM channels where the user is a recipient
    const dmChannels = await Channel.find({ recipients: userId });
    dmChannels.forEach(channel => socket.join(channel._id.toString()));

    // 2. Find all servers the user is a member of
    const memberships = await ServerMember.find({ userId });
    const memberServerIds = memberships.map(m => m.serverId);

    // 3. Join all channels in those servers
    const channelsInUserServers = await Channel.find({ serverId: { $in: memberServerIds } });
    channelsInUserServers.forEach(channel => socket.join(channel._id.toString()));

    // (Optional) Join the server rooms themselves for server-level notifications
    memberServerIds.forEach(serverId => socket.join(serverId.toString()));

    console.log(`User ${socket.user.username} joined rooms for ${dmChannels.length} DMs and ${memberServerIds.length} servers.`);

  } catch (error) {
    console.error('Error joining user to rooms:', error);
  }
};


const registerMessageHandlers = (io: SocketIOServer, socket: Socket) => {
  socket.on('message/create', async (data) => {
    try {
      if (!socket.user) return;

      const message = await createMessage({
        ...data,
        authorId: socket.user.id,
      });

      io.to(data.channelId).emit('MESSAGE_CREATE', message);
    } catch (error) {
      console.error('Error creating message:', error);
      // Optionally, emit an error event back to the client
      socket.emit('error', { message: 'Failed to create message' });
    }
  });
};

export const registerConnectionHandlers = (io: SocketIOServer, socket: Socket) => {
  console.log('Authenticated user connected:', socket.id, 'as', socket.user?.username);

  joinUserRooms(socket);

    registerMessageHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
};
