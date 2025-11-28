import { Server, Socket } from 'socket.io';
import Channel from '../models/Channel';
import Server from '../models/Server';
import { createMessage } from '../api/message/message.service';

const joinUserRooms = async (socket: Socket) => {
  if (!socket.user) return;

  try {
    const userId = socket.user.id;

    // 1. Join all DM channels where the user is a recipient
    const dmChannels = await Channel.find({ recipients: userId });
    dmChannels.forEach(channel => socket.join(channel.id.toString()));

    // 2. Find all servers owned by the user
    const ownedServers = await Server.find({ ownerId: userId });
    const ownedServerIds = ownedServers.map(s => s._id);

    // 3. Join all channels in those servers
    const channelsInUserServers = await Channel.find({ serverId: { $in: ownedServerIds } });
    channelsInUserServers.forEach(channel => socket.join(channel.id.toString()));

    // (Optional) Join the server rooms themselves for server-level notifications
    ownedServerIds.forEach(serverId => socket.join(serverId.toString()));

    console.log(`User ${socket.user.username} joined rooms for ${dmChannels.length} DMs and ${ownedServers.length} servers.`);

  } catch (error) {
    console.error('Error joining user to rooms:', error);
  }
};


const registerMessageHandlers = (io: Server, socket: Socket) => {
  socket.on('message/create', async (data) => {
    try {
      if (!socket.user) return;

      const message = await createMessage({
        ...data,
        authorId: socket.user.id,
      });

      io.to(data.channelId).emit('message/create', message);
    } catch (error) {
      console.error('Error creating message:', error);
      // Optionally, emit an error event back to the client
      socket.emit('error', { message: 'Failed to create message' });
    }
  });
};

export const registerConnectionHandlers = (io: Server, socket: Socket) => {
  console.log('Authenticated user connected:', socket.id, 'as', socket.user?.username);

  joinUserRooms(socket);

    registerMessageHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
};
