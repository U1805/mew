import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import config from '../config';
import { UnauthorizedError } from '../utils/errors';

const HEADER_NAME = 'x-mew-admin-secret';

const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

export const verifyAdminSecret = (req: Request, _res: Response, next: NextFunction) => {
  if (!config.adminSecret) {
    return next(new UnauthorizedError('Admin secret not configured.'));
  }

  const provided = req.header(HEADER_NAME);
  if (!provided || !safeEqual(provided, config.adminSecret)) {
    return next(new UnauthorizedError('Invalid admin secret.'));
  }

  next();
};

