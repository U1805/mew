import Message, { IMessage } from './message.model.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { broadcastEvent } from '../../gateway/events.js';

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
  // First, try to add the user to an existing reaction array.
  const updatedMessageWithExistingReaction = await Message.findOneAndUpdate(
    { _id: messageId, 'reactions.emoji': emoji },
    { $addToSet: { 'reactions.$.userIds': userId } },
    { new: true }
  ).populate('authorId', 'username avatarUrl');

  let finalMessage = updatedMessageWithExistingReaction;

  // If no document was updated, it means the reaction emoji doesn't exist yet.
  if (!updatedMessageWithExistingReaction) {
    finalMessage = await Message.findOneAndUpdate(
      { _id: messageId },
      { $push: { reactions: { emoji, userIds: [userId] } } },
      { new: true }
    ).populate('authorId', 'username avatarUrl');
  }

  if (!finalMessage) {
    throw new NotFoundError('Message not found');
  }

  broadcastEvent(finalMessage.channelId.toString(), 'MESSAGE_REACTION_ADD', finalMessage);
  return finalMessage;
};

export const removeReaction = async (
  messageId: string,
  userId: string,
  emoji: string
) => {
  // Pull the user's ID from the specified reaction's userIds array.
  const updatedMessage = await Message.findOneAndUpdate(
    { _id: messageId, 'reactions.emoji': emoji },
    { $pull: { 'reactions.$.userIds': userId } },
    { new: true }
  );

  if (!updatedMessage) {
    throw new NotFoundError('Message or reaction not found');
  }

  // Clean up any reactions that now have an empty userIds array.
  const finalMessage = await Message.findOneAndUpdate(
    { _id: messageId },
    { $pull: { reactions: { userIds: { $size: 0 } } } },
    { new: true }
  ).populate('authorId', 'username avatarUrl');

  if (!finalMessage) {
    // This case should ideally not be hit if the first update succeeded,
    // but it's here for safety.
    throw new NotFoundError('Message not found after reaction cleanup');
  }

  broadcastEvent(finalMessage.channelId.toString(), 'MESSAGE_REACTION_REMOVE', finalMessage);
  return finalMessage;
};