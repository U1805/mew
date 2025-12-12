import mongoose from 'mongoose';
import Member from '../member/member.model';
import Role from '../role/role.model';
import Server from '../server/server.model';
import Channel, { IChannel } from '../channel/channel.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { calculateEffectivePermissions } from '../../utils/permission.service';

async function parseAndValidateUserMentions(
  content: string,
  serverId: mongoose.Types.ObjectId | string | null | undefined
): Promise<mongoose.Types.ObjectId[]> {
  if (!serverId) {
    return []; // No mentions in DMs
  }

  const mentionRegex = /<@(\w+)>/g;
  const matches = content.matchAll(mentionRegex);
  const potentialUserIds = new Set<string>();
  for (const match of matches) {
    if (mongoose.Types.ObjectId.isValid(match[1])) {
      potentialUserIds.add(match[1]);
    }
  }

  if (potentialUserIds.size === 0) {
    return [];
  }

  const validUserIds = Array.from(potentialUserIds);

  const members = await Member.find({
    serverId,
    userId: { $in: validUserIds.map(id => new mongoose.Types.ObjectId(id)) },
  }).select('userId');

  return members.map((member) => member.userId as mongoose.Types.ObjectId);
}

async function checkEveryoneMentionPermission(
  content: string,
  channel: IChannel,
  authorId: string
) {
  if (channel.type === 'DM' || !channel.serverId) {
    return;
  }

  if (content.includes('@everyone') || content.includes('@here')) {
    const serverId = channel.serverId;

    const [member, roles, server] = await Promise.all([
      Member.findOne({ userId: authorId, serverId: serverId as any }).lean(),
      Role.find({ serverId: serverId as any }).lean(),
      Server.findById(serverId as any).select('everyoneRoleId').lean(),
    ]);

    if (!member || !server || !server.everyoneRoleId) {
      throw new ForbiddenError('Cannot verify mention permissions.');
    }

    const everyoneRole = roles.find((r) => r._id.equals(server.everyoneRoleId!));
    if (!everyoneRole) {
      throw new Error('Server configuration error: @everyone role not found.');
    }

    const permissions = calculateEffectivePermissions(member, roles, everyoneRole, channel);
    if (!permissions.has('MENTION_EVERYONE')) {
      throw new ForbiddenError('You do not have permission to use @everyone or @here in this channel.');
    }
  }
}

const mentionService = {
  async processMentions(content: string, channelId: string, authorId: string) {
    const channel = await Channel.findById(channelId).lean();
    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // 1. Check for @everyone/@here permission if used
    await checkEveryoneMentionPermission(content, channel, authorId);

    // 2. Parse and validate user-specific mentions
    const validatedMentions = await parseAndValidateUserMentions(content, channel.serverId);

    return validatedMentions;
  }
};

export default mentionService;
