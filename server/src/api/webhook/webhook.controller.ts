import { Request, Response } from 'express';
import * as WebhookService from './webhook.service';
import asyncHandler from '../../utils/asyncHandler';
import { BadRequestError } from '../../utils/errors';
import { nanoid } from 'nanoid';
import path from 'path';

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

export const getWebhookToken = asyncHandler(async (req: Request, res: Response) => {
  const { channelId, webhookId } = req.params;
  const result = await WebhookService.getWebhookTokenByChannel(channelId, webhookId);
  res.status(200).json(result);
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

export const resetWebhookToken = asyncHandler(async (req: Request, res: Response) => {
  const { webhookId } = req.params;
  const result = await WebhookService.resetWebhookToken(webhookId);
  res.status(200).json(result);
});

export const executeWebhook = asyncHandler(async (req: Request, res: Response) => {
    const { webhookId, token } = req.params;
    const message = await WebhookService.executeWebhook(webhookId, token, req.body);
    res.status(200).json(message);
});

export const uploadWebhookFile = asyncHandler(async (req: Request, res: Response) => {
  const { webhookId, token } = req.params;

  await WebhookService.assertValidWebhookToken(webhookId, token);

  if (!req.file) {
    throw new BadRequestError('No file uploaded.');
  }

  const uploaded: any = req.file as any;
  // In production, uploads are streamed to S3 by Multer storage; keep a fallback for tests/legacy paths.
  if (!uploaded.key) {
    const { uploadFile } = await import('../../utils/s3');
    Object.assign(uploaded, await uploadFile(req.file));
  }

  const attachment = {
    filename: req.file.originalname,
    contentType: uploaded.mimetype,
    key: uploaded.key,
    size: uploaded.size,
  };

  res.status(201).json(attachment);
});

export const presignWebhookFile = asyncHandler(async (req: Request, res: Response) => {
  const { webhookId, token } = req.params;
  await WebhookService.assertValidWebhookToken(webhookId, token);

  const body = (req.body || {}) as any;
  const filename = typeof body.filename === 'string' ? body.filename : '';
  const contentType = typeof body.contentType === 'string' ? body.contentType : '';
  const size = typeof body.size === 'number' ? body.size : Number.parseInt(String(body.size || ''), 10);

  if (!filename.trim()) throw new BadRequestError('filename is required');
  if (Number.isNaN(size) || size <= 0) throw new BadRequestError('size is required');
  if (size > 1024 * 1024 * 8) throw new BadRequestError('file is too large');

  const ext = path.extname(filename.trim());
  const key = `${nanoid()}${ext}`;

  const { createPresignedPutUrl } = await import('../../utils/s3');
  const { default: config } = await import('../../config');
  const url = await createPresignedPutUrl({ key, contentType: contentType.trim() || undefined });

  res.status(200).json({
    key,
    url,
    method: 'PUT',
    headers: {
      ...(contentType.trim() ? { 'Content-Type': contentType.trim() } : {}),
    },
    expiresInSeconds: config.s3.presignExpiresSeconds,
  });
});
