import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import * as botService from './bot.service';
import * as userStickerService from '../userSticker/userSticker.service';
import { deleteObject } from '../../utils/s3';

const parseTags = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    const parts = raw.includes(',') ? raw.split(',') : raw.split(/\s+/g);
    return parts.map(s => s.trim()).filter(Boolean);
  }
  return [];
};

const getBotStickerUserId = async (req: Request) => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const ownerId = req.user.id;
  const { botId } = req.params as any;
  const bot: any = await botService.getBotById(botId, ownerId);
  const botUserId = bot?.botUserId?.toString?.() || bot?.botUserId;
  if (!botUserId) {
    throw new BadRequestError('Bot user not initialized');
  }
  return { botId, botUserId };
};

export const listBotStickersHandler = asyncHandler(async (req: Request, res: Response) => {
  const { botUserId } = await getBotStickerUserId(req);
  const stickers = await userStickerService.listUserStickers(botUserId);
  res.status(200).json(stickers);
});

export const createBotStickerHandler = asyncHandler(async (req: Request, res: Response) => {
  const { botUserId } = await getBotStickerUserId(req);
  if (!req.file) throw new BadRequestError('No sticker file uploaded');

  const name = typeof (req.body as any)?.name === 'string' ? (req.body as any).name : '';
  const description = typeof (req.body as any)?.description === 'string' ? (req.body as any).description : undefined;
  const tags = parseTags((req.body as any)?.tags);

  const uploaded: any = req.file as any;
  if (!uploaded.key) {
    const { uploadFile } = await import('../../utils/s3');
    Object.assign(uploaded, await uploadFile(req.file));
  }

  const sticker = await userStickerService.createUserStickerFromUpload({
    userId: botUserId,
    name,
    description,
    tags,
    originalname: req.file.originalname,
    key: uploaded.key,
    contentType: uploaded.mimetype,
    size: uploaded.size,
  });

  res.status(201).json(sticker);
});

export const updateBotStickerHandler = asyncHandler(async (req: Request, res: Response) => {
  const { botUserId } = await getBotStickerUserId(req);
  const { stickerId } = req.params as any;
  const body = (req.body || {}) as any;

  const updated = await userStickerService.updateUserSticker({
    userId: botUserId,
    stickerId,
    ...(typeof body.name === 'string' ? { name: body.name } : {}),
    ...(typeof body.description === 'string' || body.description === null ? { description: body.description } : {}),
    ...(Array.isArray(body.tags) || typeof body.tags === 'string' ? { tags: parseTags(body.tags) } : {}),
  });

  res.status(200).json(updated);
});

export const deleteBotStickerHandler = asyncHandler(async (req: Request, res: Response) => {
  const { botUserId } = await getBotStickerUserId(req);
  const { stickerId } = req.params as any;
  const deleted = await userStickerService.deleteUserSticker({ userId: botUserId, stickerId });

  deleteObject(deleted.key).catch(() => {});
  res.status(200).json({ stickerId });
});
