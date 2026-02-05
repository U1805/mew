import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config';
import { readCookie } from '../utils/cookies';
import { getAccessTokenCookieName } from '../api/auth/accessTokenCookie.service';

// Extend Socket type to include user payload
declare module 'socket.io' {
  interface Socket {
    user?: { id: string; username: string; discriminator?: string };
  }
}

export const authMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  const tokenFromAuth = (socket.handshake.auth as any)?.token as string | undefined;
  const tokenFromCookie = readCookie(socket.handshake.headers?.cookie as any, getAccessTokenCookieName());
  const token = tokenFromAuth || tokenFromCookie;

  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const user = jwt.verify(token, config.jwtSecret) as { id: string; username: string; discriminator?: string };
    socket.user = user;
    next();
  } catch (e) {
    next(new Error('Authentication error: Invalid token'));
  }
};
