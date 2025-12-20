import { Request, Response, NextFunction } from 'express';
import config from '../config';
import { UnauthorizedError } from '../utils/errors';

const HEADER_NAME = 'x-mew-admin-secret';

export const verifyAdminSecret = (req: Request, _res: Response, next: NextFunction) => {
  if (!config.adminSecret) {
    return next(new UnauthorizedError('Admin secret not configured.'));
  }

  const provided = req.header(HEADER_NAME);
  if (!provided || provided !== config.adminSecret) {
    return next(new UnauthorizedError('Invalid admin secret.'));
  }

  next();
};

