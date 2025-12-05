import Message from '../message/message.model';
import Channel from '../channel/channel.model';
import { NotFoundError } from '../../utils/errors';

interface SearchMessagesParams {
  serverId: string;
  query: string;
  channelId?: string;
  limit?: number;
  page?: number;
}

export const searchMessagesInServer = async ({
  serverId,
  query,
  channelId,
  limit = 20,
  page = 1,
}: SearchMessagesParams) => {
  // 1. Find all channels belonging to the server
  const channelsInServer = await Channel.find({ serverId }).select('_id');
  if (!channelsInServer.length) {
    throw new NotFoundError('Server not found or has no channels');
  }
  const channelIds = channelsInServer.map((c) => c._id);

  // 2. Build the search query
  const matchQuery: any = {
    $text: { $search: query },
    channelId: { $in: channelIds },
  };

  if (channelId) {
    matchQuery.channelId = channelId;
  }

  // 3. Perform the search and get the total count
  const total = await Message.countDocuments(matchQuery);

  // 4. Perform the paginated search
  const messages = await Message.find(matchQuery)
    .populate('authorId', 'username avatarUrl')
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .skip((page - 1) * limit)
    .lean();

  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};
