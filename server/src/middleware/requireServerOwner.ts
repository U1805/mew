import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import asyncHandler from '../utils/asyncHandler';

export const requireServerOwner = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (!req.member) {
    throw new ForbiddenError('You are not a member of this server.');
  }
  if (!req.member.isOwner) {
    throw new ForbiddenError('Owner permission required.');
  }
  next();
});

