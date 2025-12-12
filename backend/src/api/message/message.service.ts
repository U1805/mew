import { IAttachment, IMessage } from './message.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { socketManager } from '../../gateway/events';
import { calculateEffectivePermissions } from '../../utils/permission.service';
import Member from '../member/member.model';
import Role from '../role/role.model';
import Server from '../server/server.model';
import Channel from '../channel/channel.model';
import mentionService from './mention.service';
import mongoose from 'mongoose';
import config from '../../config';

// [修正] 新增辅助函数，用于动态生成附件 URL
function hydrateAttachmentUrls<T extends { attachments?: IAttachment[] }>(messageObject: T): T {
  if (messageObject.attachments && messageObject.attachments.length > 0) {
    messageObject.attachments.forEach(attachment => {
      if (attachment.key) {
        attachment.url = `${config.s3.useSsl ? 'https' : 'http'}://${config.s3.bucketName}.${config.s3.webEndpoint}:${config.s3.webPort}/${attachment.key}`;
      }
    });
  }
  return messageObject;
}


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


function applyAuthorOverride<T extends { payload?: any; authorId?: any }>(messageObject: T): T {
  if (messageObject.payload && messageObject.payload.overrides && messageObject.authorId && typeof messageObject.authorId === 'object') {
    const author = messageObject.authorId as any;
    author.username = messageObject.payload.overrides.username || author.username;
    author.avatarUrl = messageObject.payload.overrides.avatarUrl || author.avatarUrl;
  }
  return messageObject;
}

// [修正] 创建一个组合函数，应用所有转换
function processMessageForClient<T extends IMessage>(message: T): object {
  let messageObject = message.toObject();
  messageObject = applyAuthorOverride(messageObject);
  messageObject = hydrateAttachmentUrls(messageObject);
  return messageObject;
}

interface GetMessagesOptions {
  channelId: string;
  limit: number;
  before?: string;
}

import { messageRepository } from './message.repository';

export const getMessagesByChannel = async (options: GetMessagesOptions) => {
  const messages = await messageRepository.findByChannel(options);
  // [修正] 使用新的组合函数处理所有消息
  return messages.map(processMessageForClient);
};

export const createMessage = async (data: Partial<IMessage>): Promise<IMessage> => {
  // We need the channel to determine server and type
  const channel = await Channel.findById(data.channelId).lean();
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }

  if (!data.channelId || !data.authorId) {
    throw new BadRequestError('Message must have a channel and an author');
  }

  // Process mentions using the new service
  const validatedMentions = await mentionService.processMentions(
    data.content || '',
    data.channelId.toString(),
    data.authorId.toString()
  );

  const message = messageRepository.create({
    ...data,
    mentions: validatedMentions, // Add validated mentions to the message data
  });
  await messageRepository.save(message);

  const populatedMessage = await message.populate('authorId', 'username avatarUrl isBot');

  // [修正] 使用组合函数处理要广播的消息
  const messageForClient = processMessageForClient(populatedMessage);

  const channelIdStr = populatedMessage.channelId.toString();

  // Broadcast to the channel room for in-room users
  socketManager.broadcast('MESSAGE_CREATE', channelIdStr, messageForClient);

  // DM reliability: also broadcast to each recipient's personal room so they
  // receive messages even if their socket hasn't joined the DM room yet.
  if (channel.type === 'DM' && channel.recipients && channel.recipients.length > 0) {
    for (const recipient of channel.recipients) {
      socketManager.broadcastToUser(recipient.toString(), 'MESSAGE_CREATE', messageForClient);
    }
  }

  // [修正] 函数的返回值也应该被处理，以便 API 调用者获得完整的 URL
  return messageForClient as IMessage;
};

export const getMessageById = async (messageId: string) => {
    const message = await messageRepository.findById(messageId);
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

    const channel = await Channel.findById(message.channelId).lean();
    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Process mentions using the new service for the updated content
    const validatedMentions = await mentionService.processMentions(
      content,
      message.channelId.toString(),
      userId
    );

    message.content = content;
    message.editedAt = new Date();
    message.mentions = validatedMentions as mongoose.Types.ObjectId[]; // Update mentions field
    await messageRepository.save(message);

    const populatedMessage = await message.populate('authorId', 'username avatarUrl isBot');

    // [修正] 使用组合函数处理更新后的消息
    const messageForClient = processMessageForClient(populatedMessage);
    socketManager.broadcast('MESSAGE_UPDATE', message.channelId.toString(), messageForClient);

    return messageForClient as IMessage;
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

    await messageRepository.save(message);

    const populatedMessage = await message.populate('authorId', 'username avatarUrl isBot');

    // [修正] 使用组合函数处理撤回后的消息状态
    const messageForClient = processMessageForClient(populatedMessage);

    // Broadcast a MESSAGE_UPDATE event so clients can show the retracted state.
    socketManager.broadcast('MESSAGE_UPDATE', message.channelId.toString(), messageForClient);

    return messageForClient as IMessage;
  };

  export const addReaction = async (
      messageId: string,
      userId: string,
      emoji: string
    ) => {
      const message = await getMessageById(messageId);
      const existingReaction = (message.reactions || []).find(r => r.userIds.map(id => id.toString()).includes(userId));

      if (existingReaction && existingReaction.emoji === emoji) {
        return processMessageForClient(await message.populate('authorId', 'username avatarUrl isBot'));
      }

      const finalMessage = await messageRepository.addReaction(messageId, userId, emoji, existingReaction?.emoji);

      if (!finalMessage) {
          throw new NotFoundError('Message not found');
      }

      const messageForClient = processMessageForClient(finalMessage);
      socketManager.broadcast('MESSAGE_REACTION_ADD', finalMessage.channelId.toString(), messageForClient);
      return messageForClient;
    };

    export const removeReaction = async (
      messageId: string,
      userId: string,
      emoji: string
    ) => {
      const finalMessage = await messageRepository.removeReaction(messageId, userId, emoji);

      if (!finalMessage) {
          throw new NotFoundError('Message not found or reaction could not be removed');
      }

      const messageForClient = processMessageForClient(finalMessage);
      socketManager.broadcast('MESSAGE_REACTION_REMOVE', finalMessage.channelId.toString(), messageForClient);
      return messageForClient;
    };
