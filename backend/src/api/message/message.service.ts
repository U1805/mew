import Message, { IMessage } from '../../models/Message';

interface GetMessagesOptions {
  channelId: string;
  limit: number;
  before?: string;
}

export const getMessagesByChannel = async ({ channelId, limit, before }: GetMessagesOptions) => {
  const query: any = { channelId };

  if (before) {
    query._id = { $lt: before };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('authorId', 'username avatarUrl');

  return messages;
};

export const createMessage = async (data: Partial<IMessage>) => {
  const message = new Message(data);
  await message.save();
  return message.populate('authorId', 'username avatarUrl');
};
