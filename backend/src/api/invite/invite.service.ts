import { nanoid } from 'nanoid';
import Invite, { IInvite } from './invite.model';
import ServerMember from '../member/member.model';
import { NotFoundError, ForbiddenError } from '../../utils/errors';

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

    const code = nanoid(10); // Generate a 10-character unique code

    return Invite.create({
      code,
      serverId,
      creatorId,
      expiresAt: options.expiresAt ? new Date(options.expiresAt) : undefined,
      maxUses: options.maxUses,
    });
  },

  async getInviteDetails(inviteCode: string): Promise<IInvite> {
    const invite = await _getAndValidateInvite(inviteCode);

    const populatedInvite = await invite.populate<{ serverId: { name: string; avatarUrl?: string } }>({ path: 'serverId', select: 'name avatarUrl' });

    const memberCount = await ServerMember.countDocuments({ serverId: invite.serverId });

    const result = populatedInvite.toObject();
    // Cast serverId to any to dynamically add the memberCount property for the response.
    (result.serverId as any).memberCount = memberCount;

    return result as IInvite;
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