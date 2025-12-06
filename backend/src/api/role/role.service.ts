import Role from './role.model';
import ServerMember from '../member/member.model';
import Channel from '../channel/channel.model';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { checkRoleHierarchy } from '../../utils/hierarchy.utils';
import { Permission } from '../../constants/permissions';
import { socketManager } from '../../gateway/events';
import { syncUserChannelPermissions } from '../../utils/permission.service';

const roleService = {
  async createRole(serverId: string, requesterId: string, data: { name: string; permissions?: Permission[]; color?: string; position?: number }) {
    const requester = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!requester || !requester.isOwner) {
      // This is a temporary check and will be replaced by MANAGE_ROLES permission.
      throw new ForbiddenError('Only the server owner can create roles.');
    }
    // The MANAGE_ROLES permission should be checked in the middleware before this service is called.
    // We are proceeding with the assumption that the permission check has passed.

    let position = data.position;
    if (position === undefined) {
      // @ts-ignore
      const highestRole = await Role.findOne({ serverId }).sort({ position: -1 });
      position = highestRole ? highestRole.position + 1 : 1;
    }

    const role = new Role({ ...data, serverId, position });
    await role.save();

    socketManager.broadcast('PERMISSIONS_UPDATE', serverId, { serverId });

    return role;
  },

  async getRolesByServer(serverId: string) {
    // @ts-ignore
    return Role.find({ serverId }).sort({ position: 'asc' });
  },

  async updateRole(roleId: string, serverId: string, requesterId: string, data: { name?: string; permissions?: Permission[]; color?: string }) {
    const requester = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }
    if (!requester.isOwner) {
      await checkRoleHierarchy(serverId, requesterId, roleId);
    }
    // @ts-ignore
    const role = await Role.findOne({ _id: roleId, serverId });
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    Object.assign(role, data);
    await role.save();

    socketManager.broadcast('PERMISSIONS_UPDATE', serverId, { serverId });

    // Asynchronously re-evaluate permissions for all affected members across all channels.
    (async () => {
      try {
        if (data.permissions) { // Only run if permissions were actually changed
          const affectedMembers = await ServerMember.find({ serverId, roleIds: role._id });
          const serverChannels = await Channel.find({ serverId });

          for (const member of affectedMembers) {
            for (const channel of serverChannels) {
              // No need to await, let it run in the background
              syncUserChannelPermissions(member.userId.toString(), channel._id.toString());
            }
          }
        }
      } catch (error) {
        console.error('Error during background permission sync after role update:', error);
      }
    })();

    return role;
  },

  async updateRolePositions(serverId: string, requesterId: string, positions: { roleId: string; position: number }[]) {
    const requester = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }
    if (!requester.isOwner) {
      for (const { roleId } of positions) {
        await checkRoleHierarchy(serverId, requesterId, roleId);
      }
    }
    const bulkOps = positions.map(({ roleId, position }) => ({
      updateOne: {
        filter: { _id: roleId, serverId },
        update: { $set: { position } },
      },
    }));

    if (bulkOps.length > 0) {
        await Role.bulkWrite(bulkOps);
    }

    return this.getRolesByServer(serverId);
  },

  async deleteRole(roleId: string, serverId: string, requesterId: string) {
    const requester = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }
    if (!requester.isOwner) {
      await checkRoleHierarchy(serverId, requesterId, roleId);
    }
    const role = await Role.findById(roleId);

    if (!role || role.serverId.toString() !== serverId) {
      throw new NotFoundError('Role not found in this server.');
    }

    if (role.isDefault) {
      throw new ForbiddenError('Cannot delete the default @everyone role.');
    }

    // Find affected members BEFORE deleting the role
    const affectedMembers = await ServerMember.find({ serverId, roleIds: role._id });
    const serverChannels = await Channel.find({ serverId });

    // @ts-ignore
    await ServerMember.updateMany({ serverId }, { $pull: { roleIds: role._id } });
    // @ts-ignore
    await Channel.updateMany({ serverId }, { $pull: { permissionOverrides: { targetType: 'role', targetId: role._id } } });

    await Role.deleteOne({ _id: roleId });

    socketManager.broadcast('PERMISSIONS_UPDATE', serverId, { serverId });

    // Asynchronously re-evaluate permissions for all affected members across all channels.
    (async () => {
      try {
        for (const member of affectedMembers) {
          for (const channel of serverChannels) {
            // No need to await, let it run in the background
            syncUserChannelPermissions(member.userId.toString(), channel._id.toString());
          }
        }
      } catch (error) {
        console.error('Error during background permission sync after role deletion:', error);
      }
    })();

    return { message: 'Role deleted successfully.' };
  },
};

export default roleService;
