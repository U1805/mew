import Message from '../message/message.model';
import Channel from '../channel/channel.model';
import { NotFoundError } from '../../utils/errors';
import { getS3PublicUrl } from '../../utils/s3';

const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface SearchMessagesParams {
  serverId: string;
  query: string;
  channelId?: string;
  limit?: number;
  page?: number;
}

interface SearchMessagesInChannelParams {
  channelId: string;
  query: string;
  limit?: number;
  page?: number;
}

const normalizeMessageForClient = (message: any) => {
  if (message?.retractedAt) {
    return {
      ...message,
      content: '此消息已撤回',
      attachments: [],
      payload: {},
      mentions: [],
    };
  }

  if (
    message.payload?.overrides &&
    message.authorId &&
    typeof message.authorId === 'object'
  ) {
    message.authorId.username =
      message.payload.overrides.username || message.authorId.username;
    message.authorId.avatarUrl =
      message.payload.overrides.avatarUrl || message.authorId.avatarUrl;
  }

  if (
    message.authorId &&
    typeof message.authorId === 'object' &&
    message.authorId.avatarUrl
  ) {
    message.authorId.avatarUrl = getS3PublicUrl(message.authorId.avatarUrl);
  }

  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      if (attachment?.key) {
        attachment.url = getS3PublicUrl(attachment.key);
      }
    }
  }

  return message;
};

export const searchMessagesInServer = async ({
  serverId,
  query,
  channelId,
  limit = 20,
  page = 1,
}: SearchMessagesParams) => {
  const trimmedQuery = (query || '').trim();
  const safeNeedle = escapeRegex(trimmedQuery);

  // 1. Find all channels belonging to the server
  const channelsInServer = await Channel.find({ serverId }).select('_id').lean();
  if (!channelsInServer.length) {
    throw new NotFoundError('Server not found or has no channels');
  }
  const channelIds = channelsInServer.map((c) => c._id);

  // 2. Build the search query
  const matchQuery: any = {
    content: { $regex: safeNeedle, $options: 'i' },
    channelId: { $in: channelIds },
    retractedAt: null,
  };

  if (channelId) {
    matchQuery.channelId = channelId;
  }

  const [total, messages] = await Promise.all([
    Message.countDocuments(matchQuery),
    Message.find(matchQuery)
      .populate('authorId', 'username discriminator avatarUrl')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean(),
  ]);

  return {
    messages: messages.map(normalizeMessageForClient),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const searchMessagesInChannel = async ({
  channelId,
  query,
  limit = 20,
  page = 1,
}: SearchMessagesInChannelParams) => {
  const trimmedQuery = (query || '').trim();
  const safeNeedle = escapeRegex(trimmedQuery);

  const matchQuery: any = {
    content: { $regex: safeNeedle, $options: 'i' },
    channelId,
    retractedAt: null,
  };

  const [total, messages] = await Promise.all([
    Message.countDocuments(matchQuery),
    Message.find(matchQuery)
      .populate('authorId', 'username discriminator avatarUrl')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean(),
  ]);

  return {
    messages: messages.map(normalizeMessageForClient),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};
