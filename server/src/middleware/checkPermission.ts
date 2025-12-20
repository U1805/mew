import { Request, Response, NextFunction } from 'express';
import {
  Permission,
  ALL_PERMISSIONS,
  DM_PERMISSIONS,
} from '../constants/permissions';
import { calculateEffectivePermissions } from '../utils/permission.service';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors';
import asyncHandler from '../utils/asyncHandler';
import Channel from '../api/channel/channel.model';
import Member from '../api/member/member.model';
import Role from '../api/role/role.model';
import Server from '../api/server/server.model';

interface AuthenticatedRequest extends Request {
  user?: { id: string; username: string; [key: string]: any };
}

/**
 * Middleware to authorize actions based on channel-level permissions.
 * Requires `channelId` in request params.
 */
export const authorizeChannel = (permission: Permission) => {
  return asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const userId = req.user?.id;
      const { channelId } = req.params;

      if (!userId) {
        return next(new ForbiddenError('Authentication required.'));
      }

      if (!channelId) {
        return next(
          new BadRequestError('Channel ID is required for this action.')
        );
      }

      const channel = await Channel.findById(channelId)
        .select('+permissionOverrides')
        .lean();
      if (!channel) {
        return next(new NotFoundError('Channel not found.'));
      }

      // Handle DM channels separately
      if (channel.type === 'DM') {
        if (channel.recipients && channel.recipients.some((id) => id.equals(userId))) {
          if (DM_PERMISSIONS.includes(permission)) {
            return next();
          }
          return next(
            new ForbiddenError(`Action not allowed in DMs: ${permission}`)
          );
        }
        return next(
          new ForbiddenError('You are not a member of this DM channel.')
        );
      }

      if (!channel.serverId) {
        return next(new BadRequestError('Invalid channel: serverId is missing.'));
      }

      const serverId = channel.serverId.toString();

      const [member, roles, server] = await Promise.all([
        Member.findOne({ userId, serverId }).lean(),
        Role.find({ serverId: serverId as any }).lean(),
        Server.findById(serverId).select('everyoneRoleId').lean(),
      ]);

      if (!member) {
        return next(new ForbiddenError('You are not a member of this server.'));
      }

      if (member.isOwner) {
        return next();
      }

      if (!server || !server.everyoneRoleId) {
        return next(new BadRequestError('Server configuration error.'));
      }

      const everyoneRole = roles.find((r) => r._id.equals(server.everyoneRoleId!));
      if (!everyoneRole) {
        return next(
          new BadRequestError('Server configuration error: @everyone role not found.')
        );
      }

      const effectivePermissions = calculateEffectivePermissions(
        member,
        roles,
        everyoneRole,
        channel
      );

      if (
        effectivePermissions.has('ADMINISTRATOR') ||
        effectivePermissions.has(permission)
      ) {
        return next();
      }

      return next(
        new ForbiddenError(`You do not have the required permission: ${permission}`)
      );
    }
  );
};

/**
 * Middleware to authorize actions based on server-level permissions.
 * Requires `serverId` in request params.
 */
export const authorizeServer = (permission: Permission) => {
  return asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const userId = req.user?.id;
      const { serverId } = req.params;

      if (!userId) {
        return next(new ForbiddenError('Authentication required.'));
      }

      if (!serverId) {
        return next(new BadRequestError('Server ID is required for this action.'));
      }

      const [member, roles, server] = await Promise.all([
        Member.findOne({ userId, serverId }).lean(),
        Role.find({ serverId: serverId as any }).lean(),
        Server.findById(serverId).select('everyoneRoleId').lean(),
      ]);

      if (!member) {
        return next(new ForbiddenError('You are not a member of this server.'));
      }

      if (member.isOwner) {
        return next();
      }

      if (!server || !server.everyoneRoleId) {
        return next(new BadRequestError('Server configuration error.'));
      }

      const everyoneRole = roles.find((r) => r._id.equals(server.everyoneRoleId!));
      if (!everyoneRole) {
        return next(
          new BadRequestError('Server configuration error: @everyone role not found.')
        );
      }

      const basePermissions = new Set<Permission>(
        everyoneRole.permissions as Permission[]
      );
      member.roleIds.forEach((roleId) => {
        const role = roles.find((r) => r._id.equals(roleId));
        if (role) {
          role.permissions.forEach((p) => basePermissions.add(p as Permission));
        }
      });

      if (
        basePermissions.has('ADMINISTRATOR') ||
        basePermissions.has(permission)
      ) {
        return next();
      }

      return next(
        new ForbiddenError(`You do not have the required permission: ${permission}`)
      );
    }
  );
};
