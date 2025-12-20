import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';

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

  if (!bearer?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const token = bearer.split(' ')[1];

  try {
    const user = jwt.verify(token, config.jwtSecret) as { id: string; username: string };
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};
