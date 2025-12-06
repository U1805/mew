import { Request, Response, NextFunction } from 'express';
import Category from '../api/category/category.model';
import ServerMember, { IServerMember } from '../api/member/member.model';
import { ForbiddenError, UnauthorizedError, NotFoundError } from '../utils/errors';
import Server from '../api/server/server.model';
import asyncHandler from '../utils/asyncHandler';

// Add 'member' to the Request type
declare global {
  namespace Express {
    interface Request {
      member?: IServerMember;
    }
  }
}

/**
 * Middleware to check if a user is a member of the server specified in req.params.serverId.
 * It fetches the membership record and attaches it to `req.member`.
 * Throws a ForbiddenError if the user is not a member.
 */
export const setServerIdFromCategory = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const categoryId = req.params.categoryId;
  if (!categoryId) {
    return res.status(400).send({ message: 'Category ID is required' });
  }

  const category = await Category.findById(categoryId).lean();
  if (!category) {
    return res.status(404).send({ message: 'Category not found' });
  }

  // Attach serverId to params for subsequent middleware
  req.params.serverId = category.serverId.toString();
  next();
});

export const checkServerMembership = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { serverId } = req.params;
  if (!serverId) {
    // This middleware is only for server-specific routes, do nothing if no serverId
    return next();
  }

  const server = await Server.findById(serverId);
  if (!server) {
    throw new NotFoundError('Server not found');
  }

  const member = await ServerMember.findOne({ serverId, userId: req.user.id });

  if (!member) {
    throw new ForbiddenError('You are not a member of this server.');
  }

  req.member = member;
  next();
});

