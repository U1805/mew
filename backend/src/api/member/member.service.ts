import { IServerMember } from './member.model';
import Channel from '../channel/channel.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { getS3PublicUrl } from '../../utils/s3';
import { checkMemberHierarchy } from '../../utils/hierarchy.utils';
import { socketManager } from '../../gateway/events';
import mongoose from 'mongoose';
import { syncUserChannelPermissions } from '../../utils/permission.service';
import webhookMemberService from './webhookMember.service';
import { memberRepository } from './member.repository';

const memberService = {
  async getMembersByServer(serverId: string, requesterId: string): Promise<any[]> {
    const requester = await memberRepository.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }

    const members = await memberRepository.find({ serverId });
    const webhookMembers = await webhookMemberService.getWebhookMembers(serverId);
    const allMembers = [...members, ...webhookMembers];

    // Hydrate avatar URLs before sending to the client
    return allMembers.map(member => {
        const memberObject = member.toObject ? member.toObject() : { ...member }; // Handle both Mongoose docs and plain objects
        if (memberObject.userId && typeof memberObject.userId === 'object' && memberObject.userId.avatarUrl) {
            memberObject.userId.avatarUrl = getS3PublicUrl(memberObject.userId.avatarUrl);
        }
        return memberObject;
    });
  },

  async removeMember(serverId: string, userIdToRemove: string, requesterId: string): Promise<void> {
    const requester = await memberRepository.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }
    if (requesterId === userIdToRemove) {
      throw new ForbiddenError('You cannot remove yourself.');
    }

    if (!requester.isOwner) {
      // TODO: Replace hierarchy check with permission check.
      await checkMemberHierarchy(serverId, requesterId, userIdToRemove);
    }
    const result = await memberRepository.deleteOne({ serverId, userId: userIdToRemove });
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
    const member = await memberRepository.findOne({ serverId, userId: requesterId });
    if (!member) {
      throw new NotFoundError('You are not a member of this server.');
    }
    if (member.isOwner) {
      const otherOwners = await memberRepository.count({ serverId, isOwner: true, userId: { $ne: requesterId } });
      if (otherOwners === 0) {
        throw new ForbiddenError('You are the only owner. Please transfer ownership before leaving.');
      }
    }
    await memberRepository.deleteOne({ _id: member._id });
    await Channel.updateMany(
      { serverId },
      { $pull: { permissionOverrides: { targetType: 'member', targetId: requesterId } } }
    );
  },

  async updateMemberRoles(serverId: string, userIdToUpdate: string, requesterId: string, roleIds: string[]): Promise<IServerMember> {
    const requester = await memberRepository.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }
    if (!requester.isOwner) {
        // TODO: Replace hierarchy check with permission check.
        await checkMemberHierarchy(serverId, requesterId, userIdToUpdate);
    }
    const member = await memberRepository.findOne({ serverId, userId: userIdToUpdate });
    if (!member) {
      throw new NotFoundError('Member not found.');
    }
    member.roleIds = roleIds.map(id => new mongoose.Types.ObjectId(id));
    await memberRepository.save(member);

    socketManager.broadcast('PERMISSIONS_UPDATE', serverId, { serverId, userId: userIdToUpdate });
    socketManager.broadcastToUser(userIdToUpdate, 'PERMISSIONS_UPDATE', { serverId, userId: userIdToUpdate });

    // Recompute per-channel permissions in background.
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

    const populatedMember = await member.populate('userId');
    const memberObject = populatedMember.toObject();
    if (memberObject.userId && typeof memberObject.userId === 'object' && memberObject.userId.avatarUrl) {
      memberObject.userId.avatarUrl = getS3PublicUrl(memberObject.userId.avatarUrl);
    }
    return memberObject;
  },
};

export default memberService;
