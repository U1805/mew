import { IAttachment, IEmbed, IMessage } from './message.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { socketManager } from '../../gateway/events';
import { extractFirstUrl, getLinkPreviewWithSafety } from '../metadata/metadata.service';
import { calculateEffectivePermissions } from '../../utils/permission.service';
import Member from '../member/member.model';
import Role from '../role/role.model';
import Server from '../server/server.model';
import Channel from '../channel/channel.model';
import mentionService from './mention.service';
import mongoose from 'mongoose';
import { getS3PublicUrl } from '../../utils/s3';
import config from '../../config';

// Convert stored attachment keys into client-consumable URLs.
function hydrateAttachmentUrls<T extends { attachments?: IAttachment[] }>(messageObject: T): T {
  if (messageObject.attachments && messageObject.attachments.length > 0) {
    messageObject.attachments.forEach(attachment => {
      if (attachment.key) {
        attachment.url = getS3PublicUrl(attachment.key);
      }
    });
  }
  return messageObject;
}

async function checkMessagePermissions(messageId: string, userId: string) {
  const message = await getMessageById(messageId);

  if (message.authorId.toString() === userId) {
    return;
  }

  const channel = await Channel.findById(message.channelId)
    .select('type serverId recipients permissionOverrides')
    .lean();
  if (!channel || channel.type === 'DM' || !channel.serverId) {
    throw new ForbiddenError('Permission check failed: Invalid channel.');
  }

  const serverId = channel.serverId.toString();

  const [member, roles, server] = await Promise.all([
    Member.findOne({ userId, serverId }).lean(),
    Role.find({ serverId: serverId as any })
      .select('_id permissions position')
      .lean(),
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

function processMessageForClient(message: any): object {
  let messageObject = typeof message?.toObject === 'function' ? message.toObject() : message;

  // Apply webhook overrides first, as they might change author data
  messageObject = applyAuthorOverride(messageObject);

  // Hydrate the author's avatar URL after potential overrides
  if (messageObject.authorId && typeof messageObject.authorId === 'object' && (messageObject.authorId as any).avatarUrl) {
    (messageObject.authorId as any).avatarUrl = getS3PublicUrl((messageObject.authorId as any).avatarUrl);
  }

  // Finally, hydrate any attachments in the message
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
  return messages.map(processMessageForClient);
};

export const createMessage = async (data: Partial<IMessage>): Promise<IMessage> => {
  const channel = await Channel.findById(data.channelId).lean();
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }

  if (!data.channelId || !data.authorId) {
    throw new BadRequestError('Message must have a channel and an author');
  }

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

  const messageForClient = processMessageForClient(populatedMessage);

  const channelIdStr = populatedMessage.channelId.toString();

  socketManager.broadcast('MESSAGE_CREATE', channelIdStr, messageForClient);

  // --- Async Metadata Fetching ---
  if (data.content && !data.attachments?.length && extractFirstUrl(data.content)) {
    getLinkPreviewWithSafety(data.content)
      .then(async (previewData) => {
        if (previewData && 'title' in previewData) {
          const embed: IEmbed = {
            url: previewData.url!,
            title: previewData.title,
            siteName: previewData.siteName,
            description: previewData.description,
            mediaType: previewData.mediaType,
            contentType: previewData.contentType,
            images: previewData.images,
            videos: previewData.videos,
            favicons: previewData.favicons,
          };

          populatedMessage.payload = { ...(populatedMessage.payload || {}), embeds: [embed] };
          await messageRepository.save(populatedMessage);

          const updatedMessageForClient = processMessageForClient(populatedMessage);

          socketManager.broadcast('MESSAGE_UPDATE', channelIdStr, updatedMessageForClient);
          if (channel.type === 'DM' && channel.recipients && channel.recipients.length > 0) {
            for (const recipient of channel.recipients) {
              socketManager.broadcastToUser(recipient.toString(), 'MESSAGE_UPDATE', updatedMessageForClient);
            }
          }
        }
      })
      .catch(err => {
        // Log error but don't crash the flow
        console.error(`[MessageService] Async link preview failed for message ${populatedMessage._id}:`, err);
      });
  }
  // --- End Async Metadata Fetching ---

  // Also broadcast to recipients' personal rooms for DM reliability.
  if (channel.type === 'DM' && channel.recipients && channel.recipients.length > 0) {
    for (const recipient of channel.recipients) {
      socketManager.broadcastToUser(recipient.toString(), 'MESSAGE_CREATE', messageForClient);
    }
  }

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

    const messageForClient = processMessageForClient(populatedMessage);
    socketManager.broadcast('MESSAGE_UPDATE', message.channelId.toString(), messageForClient);

    return messageForClient as IMessage;
  };

  export const deleteMessage = async (messageId: string, userId: string) => {
    await checkMessagePermissions(messageId, userId);
    const message = await getMessageById(messageId);

    // Retraction keeps history stable for clients and avoids hard deletes.
    message.content = '此消息已撤回';
    message.editedAt = new Date();
    message.retractedAt = new Date();
    message.attachments = [];
    message.payload = {};
    message.mentions = [];

    await messageRepository.save(message);

    const populatedMessage = await message.populate('authorId', 'username avatarUrl isBot');

    const messageForClient = processMessageForClient(populatedMessage);

    socketManager.broadcast('MESSAGE_UPDATE', message.channelId.toString(), messageForClient);

    return messageForClient as IMessage;
  };

export const addReaction = async (
      messageId: string,
      userId: string,
      emoji: string
    ) => {
      const message = await getMessageById(messageId);
      const existingReaction = (message.reactions || []).find((reaction) =>
        (reaction.userIds || []).some((id) => id.toString() === userId)
      );

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
