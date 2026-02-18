import { Server as SocketIOServer, Socket } from 'socket.io';
import { createMessage } from '../api/message/message.service';
import { addUserOnline, getOnlineUserIds, removeUserOnline } from './presence.service';
import { joinUserRoomsForSocket } from './roomSync';

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

  await joinUserRoomsForSocket(socket);

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
