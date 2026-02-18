import BotModel from '../bot/bot.model';
import UserModel from '../user/user.model';
import ServerMember from '../member/member.model';
import Server from '../server/server.model';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { getS3PublicUrl } from '../../utils/s3';
import { Types } from 'mongoose';
import { socketManager } from '../../gateway/events';
import { refreshRoomsForUser } from '../../gateway/roomSync';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const botInviteService = {
  async searchServerBots(serverId: string, query: string) {
    const server = await Server.findById(serverId).select('_id').lean();
    if (!server) {
      throw new NotFoundError('Server not found');
    }

    const escapedQuery = escapeRegex(query.trim());
    if (!escapedQuery) return [];
    const regex = new RegExp(escapedQuery, 'i');

    const memberUserIds = await ServerMember.find({ serverId }).distinct('userId');

    const candidates = await UserModel.find({
      isBot: true,
      username: { $regex: regex },
      _id: { $nin: memberUserIds },
    })
      .select('_id username discriminator avatarUrl isBot')
      .limit(20)
      .lean();

    if (candidates.length === 0) return [];

    const candidateIds = candidates.map((u: any) => u._id);
    const bots = await BotModel.find({ botUserId: { $in: candidateIds } }).select('botUserId').lean();
    const validBotUserIds = new Set<string>(bots.map((b: any) => b.botUserId?.toString()).filter(Boolean));

    return candidates
      .filter((u: any) => validBotUserIds.has(u._id.toString()))
      .slice(0, 10)
      .map((u: any) => ({
        _id: u._id,
        username: u.username,
        discriminator: u.discriminator,
        avatarUrl: u.avatarUrl ? getS3PublicUrl(u.avatarUrl) : undefined,
        isBot: true,
      }));
  },

  async inviteBotToServer(serverId: string, botUserId: string) {
    if (!Types.ObjectId.isValid(serverId) || !Types.ObjectId.isValid(botUserId)) {
      throw new NotFoundError('Bot not found');
    }

    const [server, botUser, bot] = await Promise.all([
      Server.findById(serverId).select('everyoneRoleId').lean(),
      UserModel.findById(botUserId).select('_id isBot').lean(),
      BotModel.findOne({ botUserId: new Types.ObjectId(botUserId) }).select('_id').lean(),
    ]);

    if (!server) {
      throw new NotFoundError('Server not found');
    }
    if (!botUser) {
      throw new NotFoundError('Bot not found');
    }
    if (!(botUser as any).isBot) {
      throw new ForbiddenError('Target user is not a bot');
    }
    if (!bot) {
      throw new ForbiddenError('Webhook bots cannot be added');
    }

    const existing = await ServerMember.findOne({ serverId, userId: botUserId }).select('_id').lean();
    if (existing) return;

    await ServerMember.create({
      serverId: new Types.ObjectId(serverId),
      userId: new Types.ObjectId(botUserId),
      roleIds: [server.everyoneRoleId],
    });

    socketManager.broadcast('MEMBER_JOIN', serverId, { serverId, userId: botUserId });
    void refreshRoomsForUser(botUserId);
  },
};

export default botInviteService;
