import crypto from 'crypto';
import mongoose from 'mongoose';
import { Webhook, IWebhook } from './webhook.model';
import UserModel from '../user/user.model';
import ServerModel from '../server/server.model';
import * as MessageService from '../message/message.service';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';

interface WebhookCreationData {
  name: string;
  avatarUrl?: string;
}

const findOrCreateBotUserForServer = async (serverId: string) => {
  const server = await ServerModel.findById(serverId);
  if (!server) {
    throw new NotFoundError('Server not found');
  }

  const botUsername = `webhook-bot-${serverId}`;
  let botUser = await UserModel.findOne({ username: botUsername, isBot: true });

  if (!botUser) {
    botUser = new UserModel({
        email: `${botUsername}@mew.com`,
        username: botUsername,
        password: crypto.randomBytes(32).toString('hex'),
        isBot: true,
        avatarUrl: '',
    });
    await botUser.save();
  }

  return botUser;
};

export const createWebhook = async (channelId: string, serverId: string, data: WebhookCreationData): Promise<IWebhook> => {
    const botUser = await findOrCreateBotUserForServer(serverId);
    const token = crypto.randomBytes(32).toString('hex');

    const webhook = new Webhook({
      ...data,
      channelId,
      serverId,
      botUserId: botUser._id,
      token,
    });

    await webhook.save();
    return webhook;
};

export const getWebhooksByChannel = async (channelId: string): Promise<IWebhook[]> => {
  const webhooks = await Webhook.find({ channelId });
  return webhooks;
};

export const updateWebhook = async (webhookId: string, data: Partial<WebhookCreationData>): Promise<IWebhook> => {
  const webhook = await Webhook.findByIdAndUpdate(webhookId, data, { new: true });
  if (!webhook) {
    throw new NotFoundError('Webhook not found');
  }
  return webhook;
};

export const deleteWebhook = async (webhookId: string): Promise<void> => {
  const result = await Webhook.deleteOne({ _id: webhookId });
  if (result.deletedCount === 0) {
    throw new NotFoundError('Webhook not found');
  }
};

interface ExecuteWebhookPayload {
    content: string;
    username?: string;
    avatar_url?: string;
}

export const executeWebhook = async (webhookId: string, token: string, payload: ExecuteWebhookPayload) => {
    const webhook = await Webhook.findOne({ _id: webhookId, token });

    if (!webhook) {
      throw new UnauthorizedError('Invalid webhook token');
    }

    const botUser = await UserModel.findById(webhook.botUserId);
    if (!botUser) {
      throw new NotFoundError('Associated bot user not found');
    }

    const messageData: any = {
      channelId: webhook.channelId,
      authorId: webhook.botUserId,
      content: payload.content,
      payload: {
        overrides: {
            username: payload.username || webhook.name || botUser.username,
            avatarUrl: payload.avatar_url || webhook.avatarUrl || botUser.avatarUrl,
        }
      }
    };

    const createdMessage = await MessageService.createMessage(messageData);

    return createdMessage;
};