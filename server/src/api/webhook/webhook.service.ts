import crypto from 'crypto';
import mongoose from 'mongoose';
import { IWebhook } from './webhook.model';
import { webhookRepository } from './webhook.repository';
import UserModel from '../user/user.model';
import ServerModel from '../server/server.model';
import * as MessageService from '../message/message.service';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import { getS3PublicUrl, uploadFile } from '../../utils/s3';

interface WebhookCreationData {
  name: string;
  avatarUrl?: string;
}

const RESERVED_PAYLOAD_KEYS = new Set(['webhookName', 'overrides']);

const PAYLOAD_ALLOWLIST_BY_TYPE: Record<string, Set<string>> = {
  'app/x-rss-card': new Set(['title', 'summary', 'url', 'thumbnail_url', 's3_thumbnail_url', 'feed_title', 'published_at']),
  'app/x-pornhub-card': new Set(['title', 'url', 'thumbnail_url', 's3_thumbnail_url', 'preview_url', 's3_preview_url']),
  'app/x-twitter-card': new Set([
    'id',
    'url',
    'text',
    'created_at',
    'is_retweet',
    'author_name',
    'author_handle',
    'author_avatar',
    'images',
    's3_images',
    'quoted_tweet',
    'video_url',
    's3_video_url',
    'video_content_type',
    'cover_url',
    's3_cover_url',
    'like_count',
    'retweet_count',
    'reply_count',
    'quote_count',
    'view_count',
  ]),
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function hydrateS3PrefixedFields(input: Record<string, any>): Record<string, any> {
  const hydrateValue = (key: string | null, value: any): any => {
    if (key && key.startsWith('s3_')) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed && !isHttpUrl(trimmed) ? getS3PublicUrl(trimmed) : trimmed;
      }
      if (Array.isArray(value)) {
        return value.map((item) => {
          if (typeof item === 'string') {
            const trimmed = item.trim();
            return trimmed && !isHttpUrl(trimmed) ? getS3PublicUrl(trimmed) : trimmed;
          }
          return hydrateValue(null, item);
        });
      }
    }

    if (Array.isArray(value)) {
      return value.map((item) => hydrateValue(null, item));
    }
    if (value && typeof value === 'object') {
      const objOut: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        objOut[k] = hydrateValue(k, v);
      }
      return objOut;
    }

    return value;
  };

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    if (RESERVED_PAYLOAD_KEYS.has(k)) continue;
    out[k] = hydrateValue(k, v);
  }
  return out;
}

function sanitizeCustomPayload(messageType: string, input: Record<string, any>): Record<string, any> {
  const allowlist = PAYLOAD_ALLOWLIST_BY_TYPE[messageType];
  if (!allowlist) return input;

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!allowlist.has(k)) continue;

    if (messageType === 'app/x-twitter-card' && k === 'quoted_tweet' && v && typeof v === 'object' && !Array.isArray(v)) {
      const nestedOut: Record<string, any> = {};
      for (const [nk, nv] of Object.entries(v as Record<string, any>)) {
        if (allowlist.has(nk) && nk !== 'quoted_tweet') nestedOut[nk] = nv;
      }
      out[k] = nestedOut;
      continue;
    }

    out[k] = v;
  }
  return out;
}

const getUploadedAvatarUrl = async (avatarFile?: Express.Multer.File) => {
  if (!avatarFile) return undefined;
  const existingKey = (avatarFile as any).key as string | undefined;
  const { key } = existingKey ? { key: existingKey } : await uploadFile(avatarFile);
  return getS3PublicUrl(key);
};

const createBotUserForWebhook = async (serverId: string, avatarUrl?: string) => {
  const server = await ServerModel.findById(serverId);
  if (!server) {
    throw new NotFoundError('Server not found');
  }

  const suffix = crypto.randomBytes(8).toString('hex');
  const botUsername = `webhook-${suffix}`;
  const botUser = new UserModel({
    email: `${botUsername}@internal.mew`,
    username: botUsername,
    password: crypto.randomBytes(32).toString('hex'),
    isBot: true,
    avatarUrl: avatarUrl || '',
  });
  await botUser.save();
  return botUser;
};

export const createWebhook = async (
  channelId: string,
  serverId: string,
  data: WebhookCreationData,
  avatarFile?: Express.Multer.File
): Promise<IWebhook> => {
    if (!data?.name || typeof data.name !== 'string' || data.name.trim() === '') {
      throw new BadRequestError('name is required');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const avatarUrl = (await getUploadedAvatarUrl(avatarFile)) ?? data.avatarUrl;
    const botUser = await createBotUserForWebhook(serverId, avatarUrl);

    const webhook = await webhookRepository.create({
      ...data,
      avatarUrl,
      channelId: new mongoose.Types.ObjectId(channelId),
      serverId: new mongoose.Types.ObjectId(serverId),
      botUserId: botUser._id,
      token,
    });
    return webhook;
};

export const getWebhooksByChannel = async (channelId: string): Promise<IWebhook[]> => {
  return webhookRepository.findByChannel(channelId);
};

export const updateWebhook = async (
  webhookId: string,
  data: Partial<WebhookCreationData>,
  avatarFile?: Express.Multer.File
): Promise<IWebhook> => {
  const avatarUrl = await getUploadedAvatarUrl(avatarFile);
  const finalData = { ...data };
  if (avatarUrl) {
    finalData.avatarUrl = avatarUrl;
  }

  const webhook = await webhookRepository.findByIdAndUpdate(webhookId, finalData);
  if (!webhook) {
    throw new NotFoundError('Webhook not found');
  }
  return webhook;
};

export const deleteWebhook = async (webhookId: string): Promise<void> => {
  const result = await webhookRepository.deleteOne({ _id: webhookId });
  if (result.deletedCount === 0) {
    throw new NotFoundError('Webhook not found');
  }
};

export const assertValidWebhookToken = async (webhookId: string, token: string) => {
  const webhook = await webhookRepository.findByIdAndToken(webhookId, token);
  if (!webhook) {
    throw new UnauthorizedError('Invalid webhook token');
  }
  return webhook;
};

interface ExecuteWebhookPayload {
    content?: string;
    username?: string;
    avatar_url?: string;
    type?: string;
    payload?: Record<string, any>;
}

export const executeWebhook = async (webhookId: string, token: string, payload: ExecuteWebhookPayload) => {
    const webhook = await assertValidWebhookToken(webhookId, token);

    // Lazy-migrate existing data: historically, webhooks shared a per-server bot user.
    // If this webhook's botUserId is also used by other webhooks, split it by creating
    // a dedicated bot user for this webhook and updating the webhook record.
    const sharedCount = await webhookRepository.countOtherWebhooksByBotUserId(
      webhook._id.toString(),
      webhook.botUserId.toString()
    );
    if (sharedCount > 0) {
      const newBotUser = await createBotUserForWebhook(webhook.serverId.toString(), webhook.avatarUrl);
      const updated = await webhookRepository.findByIdAndUpdate(webhook._id.toString(), {
        botUserId: newBotUser._id,
      } as any);
      if (updated) {
        (webhook as any).botUserId = updated.botUserId;
      } else {
        (webhook as any).botUserId = newBotUser._id;
      }
    }

    const botUser = await UserModel.findById(webhook.botUserId);
    if (!botUser) {
      throw new NotFoundError('Associated bot user not found');
    }

    const content = typeof payload.content === 'string' ? payload.content : '';
    
    const messageType = (typeof payload.type === 'string' && payload.type.trim() !== '') 
        ? payload.type 
        : 'message/default';

    if (messageType === 'message/default' && content.trim() === '') {
      throw new BadRequestError('content is required');
    }

    const customPayload = (payload.payload && typeof payload.payload === 'object') 
        ? payload.payload 
        : {};

    const hydratedPayload = hydrateS3PrefixedFields(customPayload);
    const sanitizedPayload = sanitizeCustomPayload(messageType, hydratedPayload);

    const messageData: any = {
      channelId: webhook.channelId,
      authorId: webhook.botUserId,
      type: messageType,
      content,
      payload: {
        ...sanitizedPayload,
        webhookName: webhook.name,
        overrides: {
            username: payload.username || webhook.name,
            avatarUrl: payload.avatar_url || webhook.avatarUrl,
        }
      },
    };

    const createdMessage = await MessageService.createMessage(messageData);

    return createdMessage;
};
