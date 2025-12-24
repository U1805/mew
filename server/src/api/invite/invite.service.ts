import { nanoid } from 'nanoid';
import { IInvite } from './invite.model';
import { inviteRepository } from './invite.repository';
import ServerMember from '../member/member.model';
import Server from '../server/server.model';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { Types } from 'mongoose';
import { socketManager } from '../../gateway/events';
import { getS3PublicUrl } from '../../utils/s3';

// This internal function gets and validates an invite, returning a Mongoose document.
async function _getAndValidateInvite(inviteCode: string): Promise<IInvite & import('mongoose').Document> {
  const invite = await inviteRepository.findOne({ code: inviteCode });

  if (!invite) {
    throw new NotFoundError('Invite not found.');
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new ForbiddenError('Invite has expired.');
  }

  if (invite.maxUses && invite.maxUses > 0 && invite.uses >= invite.maxUses) {
    throw new ForbiddenError('Invite has reached its maximum number of uses.');
  }

  return invite;
}

// Define a specific type for the lean, populated invite object to ensure type safety.
interface IPopulatedLeanInvite {
  _id: Types.ObjectId;
  code: string;
  uses: number;
  maxUses?: number;
  creatorId: Types.ObjectId;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  serverId: {
    _id: Types.ObjectId;
    name: string;
    avatarUrl?: string;
  };
}

const inviteService = {
  async createInvite(
    serverId: string,
    creatorId: string,
    options: { expiresAt?: string; maxUses?: number }
  ): Promise<IInvite> {

    const code = nanoid(10);

    return inviteRepository.create({
      code,
      serverId: new Types.ObjectId(serverId),
      creatorId: new Types.ObjectId(creatorId),
      expiresAt: options.expiresAt ? new Date(options.expiresAt) : undefined,
      maxUses: options.maxUses,
    });
  },

  async getInviteDetails(inviteCode: string): Promise<any> {
    const invite = await _getAndValidateInvite(inviteCode);
    await invite.populate('serverId', 'name avatarUrl');

    const memberCount = await ServerMember.countDocuments({ serverId: invite.serverId._id });

    // we have to cast serverId to any because the mongoose type is not perfect
    const server = invite.serverId as any;

    const response = {
      code: invite.code,
      uses: invite.uses,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt,
      server: {
        _id: server._id,
        name: server.name,
        avatarUrl: server.avatarUrl ? getS3PublicUrl(server.avatarUrl) : undefined,
        memberCount,
      },
    };

    return response;
  },

  async acceptInvite(inviteCode: string, userId: string): Promise<IInvite> {
    const invite = await _getAndValidateInvite(inviteCode);

    const existingMember = await ServerMember.findOne({ serverId: invite.serverId, userId });
    if (existingMember) {
      return invite; // User is already a member
    }

    const server = await Server.findById(invite.serverId);
    if (!server) {
      throw new NotFoundError('Associated server not found.');
    }

    await ServerMember.create({
      serverId: invite.serverId,
      userId,
      roleIds: [server.everyoneRoleId],
    });

    socketManager.broadcast('MEMBER_JOIN', invite.serverId.toString(), {
      serverId: invite.serverId.toString(),
      userId,
    });

    invite.uses += 1;
    await invite.save();

    return invite;
  },
};

export default inviteService;
