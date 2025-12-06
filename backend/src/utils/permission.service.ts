import {
  ALL_PERMISSIONS,
  Permission,
} from '../constants/permissions';
import { IChannel } from '../api/channel/channel.model';
import { IServerMember } from '../api/member/member.model';
import { IRole } from '../api/role/role.model';

const VALID_PERMISSIONS = new Set(ALL_PERMISSIONS);

/**
 * Calculates the final effective permissions for a user within a specific server channel.
 * This function operates purely in-memory and expects all necessary data to be pre-fetched.
 * It handles DM channels by returning a default set of permissions, bypassing the standard role-based calculation.
 *
 * @param member The server member record for the user.
 * @param roles A list of all roles present in the server.
 * @param everyoneRole The special @everyone role for the server.
 * @param channel The server channel for which to calculate permissions.
 * @returns A Set containing the final string permissions for the user in that channel.
 */
import { DM_PERMISSIONS } from '../constants/permissions';

export function calculateEffectivePermissions(
  member: IServerMember,
  roles: IRole[],
  everyoneRole: IRole,
  channel: IChannel
): Set<Permission> {

  // Handle DM channels separately
  if (channel.type === 'DM') {
    return new Set(DM_PERMISSIONS as Permission[]);
  }

  // 1. Handle special case: Server owner gets all permissions.
  if (member.isOwner) {
    return new Set(ALL_PERMISSIONS);
  }

  // 2. Calculate base permissions from all of the member's roles.
  let basePermissions = new Set(
    everyoneRole.permissions.filter((p) =>
      VALID_PERMISSIONS.has(p as Permission)
    ) as Permission[]
  );
  const memberRoles: IRole[] = [];

  member.roleIds.forEach((roleId) => {
    // Find the role from the pre-fetched list.
    const role = roles.find((r) => r._id.toString() === roleId.toString());
    if (role) {
      memberRoles.push(role); // Also collect for override iteration
      role.permissions.forEach((p) => {
        if (VALID_PERMISSIONS.has(p as Permission)) {
          basePermissions.add(p as Permission);
        }
      });
    }
  });

  // 3. If base permissions include ADMINISTRATOR, they get all permissions.
  if (basePermissions.has('ADMINISTRATOR')) {
    return new Set(ALL_PERMISSIONS);
  }

  // 4. Apply channel-specific permission overrides.
  let effectivePermissions = new Set(basePermissions);
  const overrides = channel.permissionOverrides || [];

  // 4a. Apply @everyone override.
  const everyoneOverride = overrides.find(
    (o) => o.targetType === 'role' && o.targetId.toString() === everyoneRole._id.toString()
  );
  if (everyoneOverride) {
    everyoneOverride.allow.forEach((p) => {
      if (VALID_PERMISSIONS.has(p as Permission)) {
        effectivePermissions.add(p as Permission);
      }
    });
    everyoneOverride.deny.forEach((p) =>
      effectivePermissions.delete(p as Permission)
    );
  }

  // 4b. Apply role-specific overrides.
  // Sort member roles by position to apply overrides in the correct hierarchy.
  memberRoles.sort((a, b) => a.position - b.position);
  memberRoles.forEach((role) => {
    const roleOverride = overrides.find(
      (o) => o.targetType === 'role' && o.targetId.toString() === role._id.toString()
    );
    if (roleOverride) {
      roleOverride.allow.forEach((p) => {
        if (VALID_PERMISSIONS.has(p as Permission)) {
          effectivePermissions.add(p as Permission);
        }
      });
      roleOverride.deny.forEach((p) =>
        effectivePermissions.delete(p as Permission)
      );
    }
  });

  // 4c. Apply member-specific override (has the highest precedence).
  const memberOverride = overrides.find(
    (o) => o.targetType === 'member' && o.targetId.toString() === member.userId.toString()
  );
  if (memberOverride) {
    memberOverride.allow.forEach((p) => {
      if (VALID_PERMISSIONS.has(p as Permission)) {
        effectivePermissions.add(p as Permission);
      }
    });
    memberOverride.deny.forEach((p) =>
      effectivePermissions.delete(p as Permission)
    );
  }

  // If user doesn't have VIEW_CHANNEL, they implicitly have no permissions in it.
  // This is a convention from Discord.
  if (!effectivePermissions.has('VIEW_CHANNEL')) {
      return new Set();
  }

  // 5. Return the final calculated permissions.
  return effectivePermissions;
}

import { socketManager } from '../gateway/events';
import ServerMember from '../api/member/member.model';
import Channel from '../api/channel/channel.model';
import Server from '../api/server/server.model';
import Role from '../api/role/role.model';

/**
 * Re-calculates a user's permissions for a specific channel and enforces
 * access by removing them from the corresponding Socket.IO room if they
 * lose VIEW_CHANNEL permission.
 *
 * @param userId The ID of the user whose permissions need to be synced.
 * @param channelId The ID of the channel to sync permissions for.
 */
export async function syncUserChannelPermissions(
  userId: string,
  channelId: string
): Promise<void> {
  const channel = await Channel.findById(channelId);
  if (!channel || !channel.serverId) return; // Not a server channel

  const server = await Server.findById(channel.serverId);
  const member = await ServerMember.findOne({ userId, serverId: channel.serverId } as any);
  const roles = await Role.find({ serverId: channel.serverId } as any);

  if (!member || !server) return;

  const everyoneRole = roles.find((r) => r._id.toString() === server.everyoneRoleId.toString());
  if (!everyoneRole) return;

  const newPermissions = calculateEffectivePermissions(member, roles, everyoneRole, channel);

  if (!newPermissions.has('VIEW_CHANNEL')) {
    const io = socketManager.getIO();
    const sockets = await io.in(userId).fetchSockets();

    for (const socket of sockets) {
      socket.leave(channelId);
      console.log(`Socket ${socket.id} for user ${userId} left room ${channelId} due to permission change.`);
    }
  }
}
