import { roleRepository } from './role.repository';
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
      throw new ForbiddenError('Only the server owner can create roles.');
    }

    let position = data.position;
    if (position === undefined) {
      const highestRole = await roleRepository.findOne({ serverId }, { position: -1 });
      position = highestRole ? highestRole.position + 1 : 1;
    }

    const role = await roleRepository.create({ ...data, serverId, position });

    socketManager.broadcast('PERMISSIONS_UPDATE', serverId, { serverId });

    return role;
  },

  async getRolesByServer(serverId: string) {
    return roleRepository.find({ serverId }, { position: 'asc' });
  },

  async updateRole(roleId: string, serverId: string, requesterId: string, data: { name?: string; permissions?: Permission[]; color?: string }) {
    const requester = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }
    if (!requester.isOwner) {
      await checkRoleHierarchy(serverId, requesterId, roleId);
    }
    const role = await roleRepository.updateById(roleId, data);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    socketManager.broadcast('PERMISSIONS_UPDATE', serverId, { serverId });

    (async () => {
      try {
        if (data.permissions) {
          const affectedMembers = await ServerMember.find({ serverId, roleIds: role._id });
          const serverChannels = await Channel.find({ serverId });

          for (const member of affectedMembers) {
            for (const channel of serverChannels) {
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
        await roleRepository.bulkWrite(bulkOps);
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
    const role = await roleRepository.findById(roleId);

    if (!role || role.serverId.toString() !== serverId) {
      throw new NotFoundError('Role not found in this server.');
    }

    if (role.isDefault) {
      throw new ForbiddenError('Cannot delete the default @everyone role.');
    }

    const affectedMembers = await ServerMember.find({ serverId, roleIds: role._id });
    const serverChannels = await Channel.find({ serverId });

    await ServerMember.updateMany({ serverId }, { $pull: { roleIds: role._id } });
    await Channel.updateMany({ serverId }, { $pull: { permissionOverrides: { targetType: 'role', targetId: role._id } } });

    await roleRepository.deleteOne({ _id: roleId });

    socketManager.broadcast('PERMISSIONS_UPDATE', serverId, { serverId });

    (async () => {
      try {
        for (const member of affectedMembers) {
          for (const channel of serverChannels) {
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
