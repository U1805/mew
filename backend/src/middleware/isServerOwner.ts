import { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler';
import ServerMember from '../api/member/member.model';
import { ForbiddenError } from '../utils/errors';

export const isServerOwner = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { serverId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    throw new ForbiddenError('Authentication required');
  }

  const member = await ServerMember.findOne({ serverId, userId });

  if (!member || !member.isOwner) {
    throw new ForbiddenError('Only the server owner can perform this action.');
  }

  next();
});
