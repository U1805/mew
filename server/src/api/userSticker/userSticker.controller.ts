import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import * as userStickerService from './userSticker.service';
import { deleteObject } from '../../utils/s3';

export const listMyStickersHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const stickers = await userStickerService.listUserStickers(req.user.id);
  res.status(200).json(stickers);
});

export const createMyStickerHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  if (!req.file) throw new BadRequestError('No sticker file uploaded');

  const name = typeof (req.body as any)?.name === 'string' ? (req.body as any).name : '';
  const description = typeof (req.body as any)?.description === 'string' ? (req.body as any).description : undefined;

  const uploaded: any = req.file as any;
  if (!uploaded.key) {
    const { uploadFile } = await import('../../utils/s3');
    Object.assign(uploaded, await uploadFile(req.file));
  }

  const sticker = await userStickerService.createUserStickerFromUpload({
    userId: req.user.id,
    name,
    description,
    originalname: req.file.originalname,
    key: uploaded.key,
    contentType: uploaded.mimetype,
    size: uploaded.size,
  });

  res.status(201).json(sticker);
});

export const updateMyStickerHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const { stickerId } = req.params as any;
  const body = (req.body || {}) as any;

  const updated = await userStickerService.updateUserSticker({
    userId: req.user.id,
    stickerId,
    ...(typeof body.name === 'string' ? { name: body.name } : {}),
    ...(typeof body.description === 'string' || body.description === null ? { description: body.description } : {}),
  });

  res.status(200).json(updated);
});

export const deleteMyStickerHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const { stickerId } = req.params as any;
  const deleted = await userStickerService.deleteUserSticker({ userId: req.user.id, stickerId });

  deleteObject(deleted.key).catch(() => {});
  res.status(200).json({ stickerId });
});

