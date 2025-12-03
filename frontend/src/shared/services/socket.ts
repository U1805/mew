
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/store';

let socket: Socket | null = null;

export const getSocket = (): Socket | null => {
  const token = useAuthStore.getState().token;

  if (!token) return null;

  if (!socket) {
    socket = io('http://localhost:3000', {
      auth: {
        token: token,
      },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Connected to Mew Gateway');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from Mew Gateway');
    });
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};