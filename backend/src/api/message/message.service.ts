import Message, { IMessage } from './message.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { broadcastEvent } from '../../gateway/events';

/**
 * Applies author overrides from a message's payload.
 * This converts a Mongoose document to a plain object and modifies it.
 * @param message The Mongoose message document.
 * @returns A plain JavaScript object representing the message with overrides applied.
 */
function applyAuthorOverride(message: IMessage): object {
  const messageObject = message.toObject();

  if (messageObject.payload && messageObject.payload.overrides && messageObject.authorId && typeof messageObject.authorId === 'object') {
    const author = messageObject.authorId as any;
    author.username = messageObject.payload.overrides.username || author.username;
    author.avatarUrl = messageObject.payload.overrides.avatarUrl || author.avatarUrl;
  }

  return messageObject;
}

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

  // Apply overrides to historical messages before returning.
  return messages.map(applyAuthorOverride);
};

export const createMessage = async (data: Partial<IMessage>): Promise<IMessage> => {
  const message = new Message(data);
  await message.save();

  const populatedMessage = await message.populate('authorId', 'username avatarUrl');

  // Apply overrides for the real-time broadcast.
  const messageWithOverrides = applyAuthorOverride(populatedMessage);

  broadcastEvent(populatedMessage.channelId.toString(), 'MESSAGE_CREATE', messageWithOverrides);

  // Return the original Mongoose document, as the function signature promises.
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

    broadcastEvent(message.channelId.toString(), 'MESSAGE_DELETE', { messageId: message._id, channelId: message.channelId.toString() });

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
        return message.populate('authorId', 'username avatarUrl');
      }

      if (existingReaction) {
        await Message.updateOne(
          { _id: messageId, 'reactions.emoji': existingReaction.emoji },
          { $pull: { 'reactions.$.userIds': userId } }
        );
      }

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

      const finalMessage = await Message.findOneAndUpdate(
        { _id: messageId },
        { $pull: { reactions: { userIds: { $size: 0 } } } },
        { new: true }
      ).populate('authorId', 'username avatarUrl');

      if (!finalMessage) {
          throw new NotFoundError('Message not found');
      }

      const messageWithOverrides = applyAuthorOverride(finalMessage);
      broadcastEvent(finalMessage.channelId.toString(), 'MESSAGE_REACTION_ADD', messageWithOverrides);
      return messageWithOverrides;
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

      const messageWithOverrides = applyAuthorOverride(finalMessage);
      broadcastEvent(finalMessage.channelId.toString(), 'MESSAGE_REACTION_REMOVE', messageWithOverrides);
      return messageWithOverrides;
    };
