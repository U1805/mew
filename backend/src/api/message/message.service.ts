import Message, { IMessage } from '../../models/Message';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { broadcastEvent } from '../../gateway/events';

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

  const populatedMessage = await message.populate('authorId', 'username avatarUrl');
  broadcastEvent(message.channelId.toString(), 'MESSAGE_CREATE', populatedMessage);

  return populatedMessage;
};

export const getMessageById = async (messageId: string) => {
  const message = await Message.findById(messageId);
  if (!message) {
    throw new NotFoundError('Message not found');
  }
  return message;
};

export const updateMessage = async (
  messageId: string,
  userId: string,
  content: string
) => {
  const message = await getMessageById(messageId);

  if (message.authorId.toString() !== userId) {
    throw new ForbiddenError('You can only edit your own messages');
  }

  message.content = content;
  message.editedAt = new Date();
  await message.save();

  const populatedMessage = await message.populate('authorId', 'username avatarUrl');
  broadcastEvent(message.channelId.toString(), 'MESSAGE_UPDATE', populatedMessage);

  return populatedMessage;
};

export const deleteMessage = async (messageId: string, userId: string) => {
  const message = await getMessageById(messageId);

  if (message.authorId.toString() !== userId) {
    throw new ForbiddenError('You can only delete your own messages');
  }

  await message.deleteOne();

  broadcastEvent(message.channelId.toString(), 'MESSAGE_DELETE', { messageId: message._id, channelId: message.channelId });

  return { message: 'Message deleted successfully' };
};

export const addReaction = async (
  messageId: string,
  userId: string,
  emoji: string
) => {
  const message = await getMessageById(messageId);
  const reaction = message.reactions?.find((r) => r.emoji === emoji);

  if (reaction) {
    if (!reaction.userIds.includes(userId as any)) {
      reaction.userIds.push(userId as any);
    }
  } else {
    message.reactions?.push({ emoji, userIds: [userId as any] });
  }

  await message.save();
  const populatedMessage = await message.populate('authorId', 'username avatarUrl');
  broadcastEvent(message.channelId.toString(), 'MESSAGE_REACTION_ADD', populatedMessage);
  return populatedMessage;
};

export const removeReaction = async (
  messageId: string,
  userId: string,
  emoji: string
) => {
  const message = await getMessageById(messageId);
  const reactionIndex = message.reactions?.findIndex((r) => r.emoji === emoji);

  if (reactionIndex === undefined || reactionIndex === -1) {
    throw new NotFoundError('Reaction not found');
  }

  const reaction = message.reactions?.[reactionIndex];
  if (reaction) {
    const userIndex = reaction.userIds.indexOf(userId as any);
    if (userIndex > -1) {
      reaction.userIds.splice(userIndex, 1);
    }

    if (reaction.userIds.length === 0) {
      message.reactions?.splice(reactionIndex, 1);
    }
  }

  await message.save();
  const populatedMessage = await message.populate('authorId', 'username avatarUrl');
  broadcastEvent(message.channelId.toString(), 'MESSAGE_REACTION_REMOVE', populatedMessage);
  return populatedMessage;
};