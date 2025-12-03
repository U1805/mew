import { Request, Response, NextFunction } from 'express';
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

/**
 * Middleware factory to authorize based on role.
 * Must be used AFTER `checkServerMembership`.
 * @param {Array<'OWNER' | 'MEMBER'>} allowedRoles - The roles allowed to access the route.
 */
export const authorizeRole = (allowedRoles: Array<'OWNER' | 'MEMBER'>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.member) {
      // This should not happen if checkServerMembership is used before this middleware
      throw new ForbiddenError('Membership details not found. Ensure checkServerMembership middleware is used.');
    }

    if (!allowedRoles.includes(req.member.role)) {
      throw new ForbiddenError(`You do not have the required permission. Allowed roles: ${allowedRoles.join(', ')}`);
    }

    next();
  };
};
