import { Server, Socket } from 'socket.io';
import Channel from '../models/Channel';
import { createMessage } from '../api/message/message.service';

const joinUserRooms = async (socket: Socket) => {
  if (!socket.user) return;

  try {
    // Find all channels where the user is a recipient (for DMs)
    const dmChannels = await Channel.find({ recipients: socket.user.id });
    dmChannels.forEach(channel => socket.join(channel.id.toString()));

    // Find all servers owned by the user
    // TODO: This should be expanded to include servers the user is a member of
    const servers = await Channel.distinct('serverId', { serverId: { $exists: true } });
    const userServers = await Channel.find({
      serverId: { $in: servers },
    //   recipients: socket.user.id, // This logic needs refinement
    }).distinct('serverId');

    const channelsInUserServers = await Channel.find({ serverId: { $in: userServers } });
    channelsInUserServers.forEach(channel => socket.join(channel.id.toString()));

    userServers.forEach(serverId => socket.join(serverId.toString()));

    console.log(`User ${socket.user.username} joined rooms for ${dmChannels.length} DMs and ${userServers.length} servers.`);

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
