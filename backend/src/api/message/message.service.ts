import Message, { IMessage } from './message.model';
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
  const existingReaction = (message.reactions || []).find(r => r.userIds.map(id => id.toString()).includes(userId));

  if (existingReaction && existingReaction.emoji === emoji) {
    // User is reacting with the same emoji, do nothing.
    return message.populate('authorId', 'username avatarUrl');
  }

  // If the user has reacted with a different emoji, pull them from the old reaction.
  if (existingReaction) {
    await Message.updateOne(
      { _id: messageId, 'reactions.emoji': existingReaction.emoji },
      { $pull: { 'reactions.$.userIds': userId } }
    );
  }

  // Now, add the user to the new reaction, creating it if it doesn't exist.
  let updatedMessage = await Message.findOneAndUpdate(
    { _id: messageId, 'reactions.emoji': emoji },
    { $addToSet: { 'reactions.$.userIds': userId } },
    { new: true }
  );

  if (!updatedMessage) {
    updatedMessage = await Message.findOneAndUpdate(
      { _id: messageId },
      { $push: { reactions: { emoji, userIds: [userId] } } },
      { new: true }
    );
  }

  // Finally, clean up any reactions that might now be empty and get the final state.
  const finalMessage = await Message.findOneAndUpdate(
    { _id: messageId },
    { $pull: { reactions: { userIds: { $size: 0 } } } },
    { new: true }
  ).populate('authorId', 'username avatarUrl');

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
  const updatedMessage = await Message.findOneAndUpdate(
    { _id: messageId, 'reactions.emoji': emoji },
    { $pull: { 'reactions.$.userIds': userId } },
    { new: true }
  );

  if (!updatedMessage) {
    throw new NotFoundError('Message or reaction not found');
  }

  const finalMessage = await Message.findOneAndUpdate(
    { _id: messageId },
    { $pull: { reactions: { userIds: { $size: 0 } } } },
    { new: true }
  ).populate('authorId', 'username avatarUrl');

  if (!finalMessage) {
    throw new NotFoundError('Message not found after reaction cleanup');
  }

  broadcastEvent(finalMessage.channelId.toString(), 'MESSAGE_REACTION_REMOVE', finalMessage);
  return finalMessage;
};
