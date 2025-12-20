import { Request, Response } from 'express';
import * as WebhookService from './webhook.service';
import asyncHandler from '../../utils/asyncHandler';

export const getWebhooks = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params;
  const webhooks = await WebhookService.getWebhooksByChannel(channelId);
  res.status(200).json(webhooks);
});

export const createWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { channelId, serverId } = req.params;
  const webhook = await WebhookService.createWebhook(channelId, serverId, req.body, req.file);
  res.status(201).json(webhook);
});

export const updateWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { webhookId } = req.params;
  const webhook = await WebhookService.updateWebhook(webhookId, req.body, req.file);
  res.status(200).json(webhook);
});

export const deleteWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { webhookId } = req.params;
  await WebhookService.deleteWebhook(webhookId);
  res.status(204).send();
});

export const executeWebhook = asyncHandler(async (req: Request, res: Response) => {
    const { webhookId, token } = req.params;
    const message = await WebhookService.executeWebhook(webhookId, token, req.body);
    res.status(200).json(message);
});
