import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { readCookie } from '../utils/cookies';
import { getAccessTokenCookieName } from '../api/auth/accessTokenCookie.service';

// Extend Express Request type to include user payload
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; username: string };
    }
  }
}

export const protect = (req: Request, res: Response, next: NextFunction) => {
  const bearer = req.headers.authorization;
  const tokenFromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : null;
  const tokenFromCookie = readCookie(req.headers.cookie, getAccessTokenCookieName());
  const token = tokenFromHeader || tokenFromCookie;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  try {
    const verifyOptions: jwt.VerifyOptions = {
      algorithms: ['HS256'],
      ...(config.jwtIssuer ? { issuer: config.jwtIssuer } : {}),
      ...(config.jwtAudience ? { audience: config.jwtAudience } : {}),
    };
    const user = jwt.verify(token, config.jwtSecret, verifyOptions) as { id: string; username: string };
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};
