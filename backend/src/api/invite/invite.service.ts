import { nanoid } from 'nanoid';
import Invite, { IInvite } from './invite.model';
import ServerMember from '../member/member.model';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { Types } from 'mongoose';

// This internal function gets and validates an invite, returning a Mongoose document.
async function _getAndValidateInvite(inviteCode: string): Promise<IInvite & import('mongoose').Document> {
  const invite = await Invite.findOne({ code: inviteCode });

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
    const member = await ServerMember.findOne({ serverId, userId: creatorId });
    if (!member || member.role !== 'OWNER') {
      throw new ForbiddenError('Only the server owner can create invites.');
    }

    const code = nanoid(10);

    return Invite.create({
      code,
      serverId,
      creatorId,
      expiresAt: options.expiresAt ? new Date(options.expiresAt) : undefined,
      maxUses: options.maxUses,
    });
  },

  async getInviteDetails(inviteCode: string): Promise<any> {
    const inviteDoc = await _getAndValidateInvite(inviteCode);

    const invite = await Invite.findOne({ code: inviteDoc.code })
      .populate('serverId', 'name avatarUrl')
      .lean<IPopulatedLeanInvite>();

    if (!invite) {
      throw new NotFoundError('Invite not found.');
    }

    const memberCount = await ServerMember.countDocuments({ serverId: invite.serverId._id });

    const response = {
      _id: invite._id,
      code: invite.code,
      uses: invite.uses,
      maxUses: invite.maxUses,
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt,
      creatorId: invite.creatorId,
      expiresAt: invite.expiresAt,
      server: {
        _id: invite.serverId._id,
        name: invite.serverId.name,
        avatarUrl: invite.serverId.avatarUrl,
        memberCount
      }
    };

    return response;
  },

  async acceptInvite(inviteCode: string, userId: string): Promise<IInvite> {
    const invite = await _getAndValidateInvite(inviteCode);

    const existingMember = await ServerMember.findOne({ serverId: invite.serverId, userId });
    if (existingMember) {
      return invite; // User is already a member
    }

    await ServerMember.create({
      serverId: invite.serverId,
      userId,
      role: 'MEMBER',
    });

    invite.uses += 1;
    await invite.save();

    return invite;
  },
};

export default inviteService;