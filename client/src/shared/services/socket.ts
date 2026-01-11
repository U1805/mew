import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

const readTokenFromStorage = (): string | null =>
  localStorage.getItem('mew_token') || sessionStorage.getItem('mew_token');

export const getSocket = (): Socket | null => {
  const token = readTokenFromStorage();

  if (!token) return null;

  if (!socket) {
    // Use same-origin. In dev, Vite proxies `/socket.io` to the API server.
    const options = {
      auth: { token },
      // Prefer WebSocket, but allow HTTP long-polling fallback for environments that block WebSockets.
      transports: ['websocket', 'polling'],
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

export const updateSocketAuthToken = (token: string) => {
  if (!socket) return;
  socket.auth = { token };
  // Auth is only used during handshake; reconnect to apply.
  socket.disconnect();
  socket.connect();
};
