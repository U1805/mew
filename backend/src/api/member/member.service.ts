import ServerMember, { IServerMember } from './member.model';
import Channel from '../channel/channel.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { checkMemberHierarchy } from '../../utils/hierarchy.utils';
import { socketManager } from '../../gateway/events';
import mongoose from 'mongoose';
import { syncUserChannelPermissions } from '../../utils/permission.service';
import { Webhook } from '../webhook/webhook.model';
import Server from '../server/server.model';

const memberService = {
  async getMembersByServer(serverId: string, requesterId: string): Promise<any[]> {
    const requester = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }

    // Step 1: Get real members and convert to plain objects
    const members = await ServerMember.find({ serverId })
      .populate('userId', 'username avatarUrl isBot')
      .lean();

    // Step 2: Get the server's webhooks
    const webhooks = await Webhook.find({ serverId }).lean();

    // Step 3: Get the @everyone role ID from the server
    const server = await Server.findById(serverId).select('everyoneRoleId').lean();
    if (!server) {
      throw new NotFoundError('Server not found.');
    }
    const everyoneRoleId = server.everyoneRoleId;

    // Step 4: Build virtual member objects for each webhook
    const webhookMembers = webhooks.map(webhook => ({
      _id: webhook._id, // Use webhook's ID for a unique key
      serverId: webhook.serverId,
      userId: {
        _id: webhook.botUserId,
        username: webhook.name,
        avatarUrl: webhook.avatarUrl,
        isBot: true,
      },
      roleIds: [everyoneRoleId],
      isOwner: false,
      nickname: null,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    }));

    // Step 5: Merge real members and virtual webhook members
    const allMembers = [...members, ...webhookMembers];

    return allMembers;
  },

  async removeMember(serverId: string, userIdToRemove: string, requesterId: string): Promise<void> {
    const requester = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }
    if (requesterId === userIdToRemove) {
      throw new ForbiddenError('You cannot remove yourself.');
    }

    if (!requester.isOwner) {
      // This check will be replaced by a permission check in a later stage.
      // For now, we allow non-owners but check their hierarchy.
      await checkMemberHierarchy(serverId, requesterId, userIdToRemove);
    }
    const result = await ServerMember.deleteOne({ serverId, userId: userIdToRemove });
    if (result.deletedCount === 0) {
      throw new NotFoundError('Member not found in this server.');
    }
    await Channel.updateMany(
      { serverId },
      { $pull: { permissionOverrides: { targetType: 'member', targetId: userIdToRemove } } }
    );
    socketManager.broadcast('SERVER_KICK', userIdToRemove, { serverId });
    socketManager.broadcast('MEMBER_LEAVE', serverId, { serverId, userId: userIdToRemove });
  },

  async leaveServer(serverId: string, requesterId: string): Promise<void> {
    const member = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!member) {
      throw new NotFoundError('You are not a member of this server.');
    }
    if (member.isOwner) {
      const otherOwners = await ServerMember.countDocuments({ serverId, isOwner: true, userId: { $ne: requesterId } });
      if (otherOwners === 0) {
        throw new ForbiddenError('You are the only owner. Please transfer ownership before leaving.');
      }
    }
    await ServerMember.deleteOne({ _id: member._id });
    await Channel.updateMany(
      { serverId },
      { $pull: { permissionOverrides: { targetType: 'member', targetId: requesterId } } }
    );
  },

  async updateMemberRoles(serverId: string, userIdToUpdate: string, requesterId: string, roleIds: string[]): Promise<IServerMember> {
    const requester = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }
    if (!requester.isOwner) {
        // This check will be replaced by a permission check in a later stage.
        await checkMemberHierarchy(serverId, requesterId, userIdToUpdate);
    }
    const member = await ServerMember.findOne({ serverId, userId: userIdToUpdate });
    if (!member) {
      throw new NotFoundError('Member not found.');
    }
    member.roleIds = roleIds.map(id => new mongoose.Types.ObjectId(id));
    await member.save();

    socketManager.broadcast('PERMISSIONS_UPDATE', serverId, { serverId, userId: userIdToUpdate });
    socketManager.broadcastToUser(userIdToUpdate, 'PERMISSIONS_UPDATE', { serverId, userId: userIdToUpdate });

    // Asynchronously re-evaluate permissions for the updated member across all channels.
    (async () => {
      try {
        const serverChannels = await Channel.find({ serverId });
        for (const channel of serverChannels) {
          await syncUserChannelPermissions(userIdToUpdate, channel._id.toString());
        }
      } catch (error) {
        console.error('Error during background permission sync after member role update:', error);
      }
    })();

    return member;
  },
};

export default memberService;
