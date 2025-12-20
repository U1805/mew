import ServerMember, { IServerMember } from '../api/member/member.model';
import Role, { IRole } from '../api/role/role.model';
import { ForbiddenError, NotFoundError } from './errors';

/**
 * Finds the highest role position for a given member.
 * @param serverId - The ID of the server.
 * @param userId - The ID of the user.
 * @returns The highest position number among all their roles.
 */
export const getMemberHighestRolePosition = async (serverId: string, userId: string): Promise<number> => {
  const member = await ServerMember.findOne({ serverId, userId }).populate<{ roleIds: IRole[] }>({
    path: 'roleIds',
  });

  if (!member || !member.roleIds || member.roleIds.length === 0) {
    return 0; // Default position if no roles
  }

  return Math.max(...member.roleIds.map(role => role.position), 0);
};

/**
 * Checks if a requester can manage a target member based on role hierarchy.
 * Throws a ForbiddenError if the check fails.
 * @param serverId - The ID of the server.
 * @param requesterId - The ID of the user making the request.
 * @param targetUserId - The ID of the user being managed.
 */
export const checkMemberHierarchy = async (serverId: string, requesterId: string, targetUserId: string): Promise<void> => {
  const requester = await ServerMember.findOne({ serverId, userId: requesterId });
  if (!requester) throw new ForbiddenError('Requester is not a member of this server.');
  if (requester.isOwner) return; // Server owner bypasses hierarchy checks

  const requesterPosition = await getMemberHighestRolePosition(serverId, requesterId);
  const targetPosition = await getMemberHighestRolePosition(serverId, targetUserId);

  if (requesterPosition <= targetPosition) {
    throw new ForbiddenError('You cannot manage a user with an equal or higher role position than your own.');
  }
};

/**
 * Checks if a requester can manage a target role based on role hierarchy.
 * Throws a ForbiddenError if the check fails.
 * @param serverId - The ID of the server.
 * @param requesterId - The ID of the user making the request.
 * @param targetRoleId - The ID of the role being managed.
 */
export const checkRoleHierarchy = async (serverId: string, requesterId: string, targetRoleId: string): Promise<void> => {
  const targetRole = await Role.findById(targetRoleId);
  if (!targetRole) throw new NotFoundError('Target role not found.');

  const requester = await ServerMember.findOne({ serverId, userId: requesterId });
  if (!requester) throw new ForbiddenError('Requester is not a member of this server.');
  if (requester.isOwner) return; // Server owner bypasses hierarchy checks

  const requesterPosition = await getMemberHighestRolePosition(serverId, requesterId);

  if (requesterPosition <= targetRole.position) {
    throw new ForbiddenError('You cannot manage a role with an equal or higher position than your own highest role.');
  }
};
