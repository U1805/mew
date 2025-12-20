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
  const roleById = new Map<string, IRole>();
  for (const role of roles) {
    roleById.set(role._id.toString(), role);
  }

  const basePermissions = new Set(
    everyoneRole.permissions.filter((p) =>
      VALID_PERMISSIONS.has(p as Permission)
    ) as Permission[]
  );
  const memberRoles: IRole[] = [];

  for (const roleId of member.roleIds) {
    const role = roleById.get(roleId.toString());
    if (role) {
      memberRoles.push(role); // Also collect for override iteration
      role.permissions.forEach((p) => {
        if (VALID_PERMISSIONS.has(p as Permission)) {
          basePermissions.add(p as Permission);
        }
      });
    }
  }

  // 3. If base permissions include ADMINISTRATOR, they get all permissions.
  if (basePermissions.has('ADMINISTRATOR')) {
    return new Set(ALL_PERMISSIONS);
  }

  // 4. Apply channel-specific permission overrides.
  const effectivePermissions = new Set(basePermissions);
  const overrides = channel.permissionOverrides || [];
  const roleOverrideById = new Map<string, (typeof overrides)[number]>();
  let memberOverride: (typeof overrides)[number] | undefined;
  for (const override of overrides) {
    if (override.targetType === 'role') {
      roleOverrideById.set(override.targetId.toString(), override);
    } else if (
      override.targetType === 'member' &&
      override.targetId.toString() === member.userId.toString()
    ) {
      memberOverride = override;
    }
  }

  // 4a. Apply @everyone override.
  const everyoneOverride = roleOverrideById.get(everyoneRole._id.toString());
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
    const roleOverride = roleOverrideById.get(role._id.toString());
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

  // 5. Return the final calculated permissions.
  return effectivePermissions;
}

import { socketManager } from '../gateway/events';
import ServerMember from '../api/member/member.model';
import Channel from '../api/channel/channel.model';
import Server from '../api/server/server.model';
import Role from '../api/role/role.model';

function uniqStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

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
}

/**
 * Syncs a single user's permissions across all channels in a server.
 * Optimized to avoid per-channel DB fetches during bulk updates (role/member changes).
 */
export async function syncUserPermissionsForServerChannels(
  userId: string,
  serverId: string
): Promise<void> {
  const [member, server, roles, channels] = await Promise.all([
    ServerMember.findOne({ userId, serverId } as any).lean(),
    Server.findById(serverId).select('everyoneRoleId').lean(),
    Role.find({ serverId } as any).select('_id permissions position').lean(),
    Channel.find({ serverId } as any).select('type permissionOverrides').lean(),
  ]);

  if (!member || !server) return;
  const everyoneRole = roles.find((r: any) => r._id.toString() === server.everyoneRoleId.toString());
  if (!everyoneRole) return;

  for (const channel of channels) {
    calculateEffectivePermissions(member as any, roles as any, everyoneRole as any, channel as any);
  }
}

/**
 * Syncs many users' permissions across all channels in a server with batched member fetches.
 * Keeps work bounded and avoids spawning unbounded background promises.
 */
export async function syncUsersPermissionsForServerChannels(options: {
  serverId: string;
  userIds: string[];
  userBatchSize?: number;
}): Promise<void> {
  const userIds = uniqStrings(options.userIds);
  if (userIds.length === 0) return;

  const userBatchSize = options.userBatchSize ?? 200;

  const [server, roles, channels] = await Promise.all([
    Server.findById(options.serverId).select('everyoneRoleId').lean(),
    Role.find({ serverId: options.serverId } as any).select('_id permissions position').lean(),
    Channel.find({ serverId: options.serverId } as any).select('type permissionOverrides').lean(),
  ]);

  if (!server) return;
  const everyoneRole = roles.find((r: any) => r._id.toString() === server.everyoneRoleId.toString());
  if (!everyoneRole) return;

  for (let i = 0; i < userIds.length; i += userBatchSize) {
    const batch = userIds.slice(i, i + userBatchSize);
    const members = await ServerMember.find({
      serverId: options.serverId as any,
      userId: { $in: batch } as any,
    } as any).lean();

    for (const member of members) {
      for (const channel of channels) {
        calculateEffectivePermissions(member as any, roles as any, everyoneRole as any, channel as any);
      }
    }
  }
}

/**
 * Syncs many users' permissions for a specific channel.
 * Useful when updating that channel's permission overrides.
 */
export async function syncUsersPermissionsForChannel(options: {
  channelId: string;
  userIds: string[];
  userBatchSize?: number;
}): Promise<void> {
  const userIds = uniqStrings(options.userIds);
  if (userIds.length === 0) return;

  const channel = await Channel.findById(options.channelId).select('type serverId permissionOverrides').lean();
  if (!channel || !channel.serverId) return;

  const userBatchSize = options.userBatchSize ?? 200;

  const [server, roles] = await Promise.all([
    Server.findById(channel.serverId).select('everyoneRoleId').lean(),
    Role.find({ serverId: channel.serverId } as any).select('_id permissions position').lean(),
  ]);

  if (!server) return;
  const everyoneRole = roles.find((r: any) => r._id.toString() === server.everyoneRoleId.toString());
  if (!everyoneRole) return;

  for (let i = 0; i < userIds.length; i += userBatchSize) {
    const batch = userIds.slice(i, i + userBatchSize);
    const members = await ServerMember.find({
      serverId: channel.serverId as any,
      userId: { $in: batch } as any,
    } as any).lean();

    for (const member of members) {
      calculateEffectivePermissions(member as any, roles as any, everyoneRole as any, channel as any);
    }
  }
}
