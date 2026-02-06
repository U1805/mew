import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

let socket: Socket | null = null;

export const getSocket = (): Socket | null => {
  const status = useAuthStore.getState().status;
  if (status !== 'authenticated') return null;

  if (!socket) {
    // Use same-origin. In dev, Vite proxies `/socket.io` to the API server.
    const options = {
      // Prefer WebSocket, but allow HTTP long-polling fallback for environments that block WebSockets.
      transports: ['websocket', 'polling'],
      withCredentials: true,
    };

    socket = io(options);

    socket.on('connect', () => {
      console.log('Connected to Mew Gateway');
    });

    socket.on('connect_error', (err) => {
      if ((import.meta as any).env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn('Mew Gateway connect_error', err);
      }
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

