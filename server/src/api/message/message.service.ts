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
import Sticker from '../sticker/sticker.model';
import UserSticker from '../userSticker/userSticker.model';

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

function buildMessageContext(messageObject: any): string {
  const content = typeof messageObject?.content === 'string' ? messageObject.content.trim() : '';
  const type = typeof messageObject?.type === 'string' ? messageObject.type.trim() : '';
  const payload = messageObject?.payload && typeof messageObject.payload === 'object' ? messageObject.payload : undefined;
  const attachments = Array.isArray(messageObject?.attachments) ? messageObject.attachments : [];

  if (content) return content;

  const parts: string[] = [];

  // app/x-forward-card: use the embedded forwarded message as context.
  if (type === 'app/x-forward-card' && payload?.forwardedMessage && typeof payload.forwardedMessage === 'object') {
    const fm = payload.forwardedMessage as any;
    const fromLabel = typeof payload.forwardedFromLabel === 'string' ? payload.forwardedFromLabel.trim() : '';
    const author = fm.author && typeof fm.author === 'object' ? fm.author : undefined;
    const authorName = typeof author?.username === 'string' ? author.username.trim() : '';
    const forwardedText = typeof fm.content === 'string' ? fm.content.trim() : '';

    if (fromLabel) parts.push(`forwarded_from: ${fromLabel}`);
    if (authorName) parts.push(`forwarded_author: ${authorName}`);
    if (forwardedText) parts.push(forwardedText);

    const forwardedAttachments = Array.isArray(fm.attachments) ? fm.attachments : [];
    const forwardedFilenames = forwardedAttachments
      .map((a: any) => (typeof a?.filename === 'string' ? a.filename.trim() : ''))
      .filter(Boolean);
    if (forwardedFilenames.length > 0) {
      parts.push(`forwarded_attachments: ${forwardedFilenames.join(', ')}`);
    }
  }

  // Common card-style payload fields.
  if (payload) {
    const sticker = payload?.sticker && typeof payload.sticker === 'object' ? payload.sticker : undefined;
    const stickerName = typeof sticker?.name === 'string' ? sticker.name.trim() : '';
    if (stickerName) parts.push(`sticker: ${stickerName}`);

    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    const webhookName = typeof payload.webhookName === 'string' ? payload.webhookName.trim() : '';

    if (webhookName) parts.push(`source: ${webhookName}`);
    if (title) parts.push(`title: ${title}`);
    if (summary) parts.push(`summary: ${summary}`);
    if (url) parts.push(`url: ${url}`);

    const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];
    for (const e of embeds) {
      if (!e || typeof e !== 'object') continue;
      const eUrl = typeof (e as any).url === 'string' ? (e as any).url.trim() : '';
      const eTitle = typeof (e as any).title === 'string' ? (e as any).title.trim() : '';
      const eDesc = typeof (e as any).description === 'string' ? (e as any).description.trim() : '';
      const line = [eTitle, eDesc, eUrl].filter(Boolean).join(' | ');
      if (line) parts.push(`embed: ${line}`);
    }
  }

  // Fallback: attachments list, if any.
  const filenames = attachments
    .map((a: any) => (typeof a?.filename === 'string' ? a.filename.trim() : ''))
    .filter(Boolean);
  if (filenames.length > 0) {
    parts.push(`attachments: ${filenames.join(', ')}`);
  }

  return parts.join('\n').trim();
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
  const overrides = messageObject.payload?.overrides;
  const author = messageObject.authorId as any;

  if (!overrides || !author || typeof author !== 'object') return messageObject;

  // When multiple messages share the same populated author object (e.g. lean+populate),
  // mutating it in-place causes the last override to "leak" into other messages.
  if (typeof author.username !== 'string' && typeof author.avatarUrl !== 'string') return messageObject;

  messageObject.authorId = {
    ...author,
    username: overrides.username ?? author.username,
    avatarUrl: overrides.avatarUrl ?? author.avatarUrl,
  };
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

  // Hydrate sticker URLs (if any).
  if (messageObject?.payload?.sticker && typeof messageObject.payload.sticker === 'object') {
    const key = (messageObject.payload.sticker as any).key;
    if (typeof key === 'string' && key) {
      (messageObject.payload.sticker as any).url = getS3PublicUrl(key);
    }
  }

  // Provide a unified plain-text context string for bots/LLM consumers.
  messageObject.context = buildMessageContext(messageObject);

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

  if (data.type === 'app/x-forward-card') {
    const payload = data.payload as any;
    const forwarded = payload?.forwardedMessage;

    if (!forwarded || typeof forwarded !== 'object') {
      throw new BadRequestError('Forward payload is invalid');
    }

    const forwardedAttachments = Array.isArray(forwarded.attachments)
      ? forwarded.attachments
          .map((a: any) => {
            if (!a || typeof a !== 'object') return null;
            return {
              filename: typeof a.filename === 'string' ? a.filename : '',
              contentType: typeof a.contentType === 'string' ? a.contentType : 'application/octet-stream',
              url: typeof a.url === 'string' ? a.url : undefined,
              size: typeof a.size === 'number' ? a.size : 0,
            };
          })
          .filter(Boolean)
      : [];

    const forwardedAuthor =
      forwarded.authorId && typeof forwarded.authorId === 'object'
        ? {
            _id: (forwarded.authorId as any)._id,
            username: (forwarded.authorId as any).username,
            avatarUrl: (forwarded.authorId as any).avatarUrl,
            isBot: (forwarded.authorId as any).isBot,
          }
        : forwarded.author && typeof forwarded.author === 'object'
          ? {
              _id: (forwarded.author as any)._id,
              username: (forwarded.author as any).username,
              avatarUrl: (forwarded.author as any).avatarUrl,
              isBot: (forwarded.author as any).isBot,
            }
          : undefined;

    data.content = '';
    data.attachments = [];
    data.payload = {
      forwardedFromLabel: typeof payload?.forwardedFromLabel === 'string' ? payload.forwardedFromLabel : undefined,
      forwardedMessage: {
        _id: typeof forwarded._id === 'string' ? forwarded._id : undefined,
        type: typeof forwarded.type === 'string' ? forwarded.type : 'message/default',
        content: typeof forwarded.content === 'string' ? forwarded.content : '',
        payload: forwarded.payload && typeof forwarded.payload === 'object' ? forwarded.payload : undefined,
        attachments: forwardedAttachments,
        ...(forwardedAuthor ? { author: forwardedAuthor } : {}),
        createdAt:
          typeof forwarded.createdAt === 'string' || forwarded.createdAt instanceof Date
            ? forwarded.createdAt
            : undefined,
      },
    };
  }

  if (data.type === 'message/sticker') {
    const payload = data.payload && typeof data.payload === 'object' ? (data.payload as any) : {};
    const stickerIdRaw = payload?.stickerId;
    const stickerId = typeof stickerIdRaw === 'string' ? stickerIdRaw.trim() : '';
    if (!stickerId) {
      throw new BadRequestError('stickerId is required for sticker messages');
    }

    const scopeRaw = payload?.stickerScope ?? payload?.stickerSource;
    const scopeStr = typeof scopeRaw === 'string' ? scopeRaw.trim() : '';
    const scope: 'server' | 'user' =
      scopeStr === 'user' || scopeStr === 'server' ? (scopeStr as any) : channel.serverId ? 'server' : 'user';

    // Sticker messages are allowed to have no content/attachments.
    data.content = typeof data.content === 'string' ? data.content : '';
    data.attachments = [];

    if (scope === 'server') {
      if (!channel.serverId) {
        throw new BadRequestError('Server stickers are only available in server channels');
      }

      const sticker = await Sticker.findOne({ _id: stickerId, serverId: channel.serverId }).lean();
      if (!sticker) {
        throw new NotFoundError('Sticker not found');
      }

      data.payload = {
        ...(data.payload && typeof data.payload === 'object' ? data.payload : {}),
        sticker: {
          _id: sticker._id,
          scope: 'server',
          serverId: sticker.serverId,
          name: sticker.name,
          description: sticker.description,
          tags: sticker.tags,
          format: sticker.format,
          contentType: sticker.contentType,
          key: sticker.key,
          size: sticker.size,
          url: getS3PublicUrl(sticker.key),
        },
      };
    } else {
      const authorIdStr = typeof data.authorId === 'string' ? data.authorId : (data.authorId as any)?.toString?.();
      if (!authorIdStr) {
        throw new BadRequestError('authorId is required for sticker messages');
      }

      const sticker = await UserSticker.findOne({ _id: stickerId, userId: authorIdStr }).lean();
      if (!sticker) {
        throw new NotFoundError('Sticker not found');
      }

      data.payload = {
        ...(data.payload && typeof data.payload === 'object' ? data.payload : {}),
        sticker: {
          _id: sticker._id,
          scope: 'user',
          ownerId: sticker.userId,
          name: sticker.name,
          description: sticker.description,
          tags: sticker.tags,
          format: sticker.format,
          contentType: sticker.contentType,
          key: sticker.key,
          size: sticker.size,
          url: getS3PublicUrl(sticker.key),
        },
      };
    }
  }

  if (data.referencedMessageId) {
    const referenced = await messageRepository.findById(data.referencedMessageId.toString());
    if (!referenced) {
      throw new NotFoundError('Referenced message not found');
    }
    if (referenced.channelId.toString() !== data.channelId.toString()) {
      throw new ForbiddenError('Referenced message must be in the same channel');
    }
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

  const populatedMessage = await message.populate('authorId', 'username discriminator avatarUrl isBot');

  const messageForClient = processMessageForClient(populatedMessage);

  const channelIdStr = populatedMessage.channelId.toString();

  if (channel.type === 'DM' && channel.recipients && channel.recipients.length > 0) {
    // DM users join both the DM channel room and their personal room; broadcasting to both causes duplicates.
    for (const recipient of channel.recipients) {
      socketManager.broadcastToUser(recipient.toString(), 'MESSAGE_CREATE', messageForClient);
    }
  } else {
    socketManager.broadcast('MESSAGE_CREATE', channelIdStr, messageForClient);
  }

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

          if (channel.type === 'DM' && channel.recipients && channel.recipients.length > 0) {
            for (const recipient of channel.recipients) {
              socketManager.broadcastToUser(recipient.toString(), 'MESSAGE_UPDATE', updatedMessageForClient);
            }
          } else {
            socketManager.broadcast('MESSAGE_UPDATE', channelIdStr, updatedMessageForClient);
          }
        }
      })
      .catch(err => {
        // Log error but don't crash the flow
        console.error(`[MessageService] Async link preview failed for message ${populatedMessage._id}:`, err);
      });
  }
  // --- End Async Metadata Fetching ---

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

    const populatedMessage = await message.populate('authorId', 'username discriminator avatarUrl isBot');

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

    const populatedMessage = await message.populate('authorId', 'username discriminator avatarUrl isBot');

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
        return processMessageForClient(await message.populate('authorId', 'username discriminator avatarUrl isBot'));
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
