import ServerMember, { IServerMember } from './member.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';

const memberService = {
  async getMembersByServer(serverId: string, requesterId: string): Promise<IServerMember[]> {
    // Permission check: Requester must be a member of the server
    const requester = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!requester) {
      throw new ForbiddenError('You are not a member of this server.');
    }

    const members = await ServerMember.find({ serverId }).populate('userId', 'username avatarUrl');
    return members;
  },

  async removeMember(serverId: string, userIdToRemove: string, requesterId: string): Promise<void> {
    // Permission check: Requester must be the server owner
    const requester = await ServerMember.findOne({ serverId, userId: requesterId });
    if (!requester || requester.role !== 'OWNER') {
      throw new ForbiddenError('Only the server owner can remove members.');
    }

    if (requesterId === userIdToRemove) {
      throw new ForbiddenError('You cannot remove yourself.');
    }

    const result = await ServerMember.deleteOne({ serverId, userId: userIdToRemove });

    if (result.deletedCount === 0) {
      throw new NotFoundError('Member not found in this server.');
    }
  },

  async leaveServer(serverId: string, requesterId: string): Promise<void> {
    const member = await ServerMember.findOne({ serverId, userId: requesterId });

    if (!member) {
      throw new NotFoundError('You are not a member of this server.');
    }

    if (member.role === 'OWNER') {
      const otherOwners = await ServerMember.countDocuments({ serverId, role: 'OWNER', userId: { $ne: requesterId } });
      if (otherOwners === 0) {
        throw new ForbiddenError('You are the only owner. Please transfer ownership before leaving.');
      }
    }

    await ServerMember.deleteOne({ _id: member._id });
  },

};

export default memberService;
