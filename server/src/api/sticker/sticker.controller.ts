import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import * as stickerService from './sticker.service';
import { deleteObject } from '../../utils/s3';
import { socketManager } from '../../gateway/events';

const parseTags = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    // Accept "a,b,c" or "a b c" (Discord-like).
    const parts = raw.includes(',') ? raw.split(',') : raw.split(/\s+/g);
    return parts.map(s => s.trim()).filter(Boolean);
  }
  return [];
};

export const listStickersHandler = asyncHandler(async (req: Request, res: Response) => {
  const { serverId } = req.params;
  const stickers = await stickerService.listStickers(serverId);
  res.status(200).json(stickers);
});

export const createStickerHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const { serverId } = req.params;

  if (!req.file) throw new BadRequestError('No sticker file uploaded');

  const name = typeof (req.body as any)?.name === 'string' ? (req.body as any).name : '';
  const description = typeof (req.body as any)?.description === 'string' ? (req.body as any).description : undefined;
  const tags = parseTags((req.body as any)?.tags);

  const uploaded: any = req.file as any;
  if (!uploaded.key) {
    // Fallback for tests/legacy paths
    const { uploadFile } = await import('../../utils/s3');
    Object.assign(uploaded, await uploadFile(req.file));
  }

  const sticker = await stickerService.createStickerFromUpload({
    serverId,
    createdBy: req.user.id,
    name,
    description,
    tags,
    originalname: req.file.originalname,
    key: uploaded.key,
    contentType: uploaded.mimetype,
    size: uploaded.size,
  });

  socketManager.broadcast('STICKER_CREATE', serverId, sticker);
  res.status(201).json(sticker);
});

export const updateStickerHandler = asyncHandler(async (req: Request, res: Response) => {
  const { serverId, stickerId } = req.params as any;
  const body = (req.body || {}) as any;

  const updated = await stickerService.updateSticker({
    serverId,
    stickerId,
    ...(typeof body.name === 'string' ? { name: body.name } : {}),
    ...(typeof body.description === 'string' || body.description === null ? { description: body.description } : {}),
    ...(Array.isArray(body.tags) || typeof body.tags === 'string' ? { tags: parseTags(body.tags) } : {}),
  });

  socketManager.broadcast('STICKER_UPDATE', serverId, updated);
  res.status(200).json(updated);
});

export const deleteStickerHandler = asyncHandler(async (req: Request, res: Response) => {
  const { serverId, stickerId } = req.params as any;
  const deleted = await stickerService.deleteSticker({ serverId, stickerId });

  // Best-effort cleanup of the underlying object.
  deleteObject(deleted.key).catch(() => {});

  socketManager.broadcast('STICKER_DELETE', serverId, { stickerId });
  res.status(200).json({ stickerId });
});

