import crypto from 'crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
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

const ALLOWED_WEBHOOK_MESSAGE_TYPES = new Set([
  'message/default',
  'app/x-rss-card',
  'app/x-pornhub-card',
  'app/x-twitter-card',
  'app/x-bilibili-card',
  'app/x-instagram-card',
  'app/x-tiktok-card',
  'app/x-jpdict-card',
]);

const RESERVED_PAYLOAD_KEYS = new Set(['webhookName', 'overrides']);

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
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {

    if (messageType === 'app/x-twitter-card' && k === 'quoted_tweet' && v && typeof v === 'object' && !Array.isArray(v)) {
      const nestedOut: Record<string, any> = {};
      for (const [nk, nv] of Object.entries(v as Record<string, any>)) {
        if (nk !== 'quoted_tweet') nestedOut[nk] = nv;
      }
      out[k] = nestedOut;
      continue;
    }

    if (messageType === 'app/x-bilibili-card' && k === 'original_post' && v && typeof v === 'object' && !Array.isArray(v)) {
      const sanitizeNested = (obj: Record<string, any>, depth: number): Record<string, any> => {
        const nestedOut: Record<string, any> = {};
        for (const [nk, nv] of Object.entries(obj)) {
          if (nk === 'original_post' && nv && typeof nv === 'object' && !Array.isArray(nv) && depth < 2) {
            nestedOut[nk] = sanitizeNested(nv as Record<string, any>, depth + 1);
            continue;
          }
          nestedOut[nk] = nv;
        }
        return nestedOut;
      };
      out[k] = sanitizeNested(v as Record<string, any>, 1);
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
  const hashedPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  const botUser = new UserModel({
    email: `${botUsername}@internal.mew`,
    username: botUsername,
    password: hashedPassword,
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
): Promise<IWebhook & { token: string }> => {
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

    // token is stored with select:false, so return it explicitly on creation.
    return Object.assign(webhook, { token });
};

export const getWebhooksByChannel = async (channelId: string): Promise<IWebhook[]> => {
  return webhookRepository.findByChannel(channelId);
};

export const getWebhookTokenByChannel = async (
  channelId: string,
  webhookId: string
): Promise<{ webhookId: string; token: string }> => {
  const webhook = await webhookRepository.findByIdAndChannelWithToken(webhookId, channelId);
  if (!webhook) {
    throw new NotFoundError('Webhook not found');
  }
  return { webhookId: webhook._id.toString(), token: webhook.token };
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

export const resetWebhookToken = async (webhookId: string): Promise<{ webhookId: string; token: string }> => {
  const token = crypto.randomBytes(32).toString('hex');
  const updated = await webhookRepository.findByIdAndUpdate(webhookId, { token } as any);
  if (!updated) {
    throw new NotFoundError('Webhook not found');
  }
  return { webhookId: updated._id.toString(), token };
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

    if (!ALLOWED_WEBHOOK_MESSAGE_TYPES.has(messageType)) {
      throw new BadRequestError(`Unsupported message type: ${messageType}`);
    }

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

    const createdMessage = await MessageService.createMessage(messageData, { bypassPermissions: true });

    return createdMessage;
};
