import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';

// Extend Socket type to include user payload
declare module 'socket.io' {
  interface Socket {
    user?: { id: string; username: string };
  }
}

export const authMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const user = jwt.verify(token, config.jwtSecret) as { id: string; username: string };
    socket.user = user;
    next();
  } catch (e) {
    next(new Error('Authentication error: Invalid token'));
  }
};
