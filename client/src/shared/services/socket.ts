import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { API_URL } from './http';

let socket: Socket | null = null;
let isRecoveringAuth = false;

const tryRecoverSocketAuth = async () => {
  if (isRecoveringAuth) return;
  isRecoveringAuth = true;
  try {
    await axios.get(`${API_URL}/auth/csrf`, { withCredentials: true });
    await axios.post(
      `${API_URL}/auth/refresh-cookie`,
      {},
      { withCredentials: true, xsrfCookieName: 'mew_csrf_token', xsrfHeaderName: 'X-Mew-Csrf-Token' }
    );
    socket?.connect();
  } catch {
    await useAuthStore.getState().logout();
  } finally {
    isRecoveringAuth = false;
  }
};

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
      const msg = String((err as any)?.message || '');
      if (msg.includes('Authentication error')) {
        void tryRecoverSocketAuth();
      }
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

