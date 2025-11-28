import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

const URL = import.meta.env.VITE_API_BASE_URL.replace('/api', '');

let socket: Socket;

export const getSocket = () => {
  if (!socket) {
    const token = useAuthStore.getState().token;

    if (!token) {
      throw new Error('No token found for WebSocket connection');
    }

    socket = io(URL, {
      auth: {
        token: token,
      },
    });
  }

  return socket;
};
