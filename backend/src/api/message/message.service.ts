import Message, { IMessage } from './message.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { socketManager } from '../../gateway/events';
import { calculateEffectivePermissions } from '../../utils/permission.service';
import Member from '../member/member.model';
import Role from '../role/role.model';
import Server from '../server/server.model';
import Channel from '../channel/channel.model';
import { Permission } from '../../constants/permissions';

async function checkMessagePermissions(messageId: string, userId: string) {
  const message = await getMessageById(messageId);

  // If the user is the author, they can always edit/delete.
  if (message.authorId.toString() === userId) {
    return;
  }

  // If not the author, check for MANAGE_MESSAGES permission.
  const channel = await Channel.findById(message.channelId).lean();
  if (!channel || channel.type === 'DM' || !channel.serverId) {
    throw new ForbiddenError('Permission check failed: Invalid channel.');
  }

  const serverId = channel.serverId.toString();

  const [member, roles, server] = await Promise.all([
    Member.findOne({ userId, serverId }).lean(),
    Role.find({ serverId: serverId as any }).lean(),
    Server.findById(serverId).select('everyoneRoleId').lean(),
  ]);

  if (!member) {
    throw new ForbiddenError('You are not a member of this server.');
  }

  if (member.isOwner) {
    return; // Owner can do anything
  }

  if (!server || !server.everyoneRoleId) {
    throw new Error('Server configuration error.');
  }

  const everyoneRole = roles.find((r) => r._id.equals(server.everyoneRoleId!));
  if (!everyoneRole) {
    throw new Error('Server configuration error: @everyone role not found.');
  }

  const permissions = calculateEffectivePermissions(member, roles, everyoneRole, channel);

  if (!permissions.has('MANAGE_MESSAGES')) {
    throw new ForbiddenError('You do not have permission to manage this message.');
  }
}

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

  socketManager.broadcast('MESSAGE_CREATE', populatedMessage.channelId.toString(), messageWithOverrides);

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
    await checkMessagePermissions(messageId, userId);
    const message = await getMessageById(messageId);

    message.content = content;
    message.editedAt = new Date();
    await message.save();

    const populatedMessage = await message.populate('authorId', 'username avatarUrl');
    socketManager.broadcast('MESSAGE_UPDATE', message.channelId.toString(), populatedMessage);

    return populatedMessage;
  };

  export const deleteMessage = async (messageId: string, userId: string) => {
    await checkMessagePermissions(messageId, userId);
    const message = await getMessageById(messageId);

    // Instead of deleting, we update the message to mark it as retracted.
    message.content = '此消息已撤回';
    message.editedAt = new Date();
    message.retractedAt = new Date();
    message.attachments = [];
    message.payload = {};
    message.mentions = [];

    await message.save();

    const populatedMessage = await message.populate('authorId', 'username avatarUrl');

    // Broadcast a MESSAGE_UPDATE event so clients can show the retracted state.
    socketManager.broadcast('MESSAGE_UPDATE', message.channelId.toString(), populatedMessage);

    return populatedMessage;
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
      socketManager.broadcast('MESSAGE_REACTION_ADD', finalMessage.channelId.toString(), messageWithOverrides);
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
      socketManager.broadcast('MESSAGE_REACTION_REMOVE', finalMessage.channelId.toString(), messageWithOverrides);
      return messageWithOverrides;
    };
