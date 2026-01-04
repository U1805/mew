import { Types } from 'mongoose';
import UserSticker, { IUserSticker, UserStickerFormat } from './userSticker.model';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { getS3PublicUrl } from '../../utils/s3';

export type UserStickerForClient = Omit<
  IUserSticker,
  'userId' | 'toObject' | 'populate' | 'save' | 'validate' | 'validateSync' | '$locals' | '$where' | 'collection'
> & {
  _id: any;
  scope: 'user';
  ownerId: any;
  url: string;
};

const inferFormat = (contentType: string, filename: string): UserStickerFormat => {
  const ct = (contentType || '').toLowerCase();
  if (ct === 'image/gif') return 'gif';
  if (ct === 'image/webp') return 'webp';
  if (ct === 'image/png') return 'png';

  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'gif') return 'gif';
  if (ext === 'webp') return 'webp';
  return 'png';
};

export const userStickerToClient = (sticker: any): UserStickerForClient => {
  const obj = typeof sticker?.toObject === 'function' ? sticker.toObject() : sticker;
  const { tags: _tags, ...rest } = obj || {};
  return {
    ...rest,
    scope: 'user',
    ownerId: obj?.userId,
    url: obj?.key ? getS3PublicUrl(obj.key) : '',
  };
};

export const listUserStickers = async (userId: string) => {
  const stickers = await UserSticker.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).lean();
  return stickers.map(userStickerToClient);
};

export const createUserStickerFromUpload = async (options: {
  userId: string;
  name: string;
  description?: string;
  originalname: string;
  key: string;
  contentType: string;
  size: number;
}) => {
  const name = options.name.trim();
  if (!name) throw new BadRequestError('Sticker name is required');

  const format = inferFormat(options.contentType, options.originalname);

  const doc = await UserSticker.create({
    userId: new Types.ObjectId(options.userId),
    name,
    description: options.description?.trim() || undefined,
    format,
    contentType: options.contentType,
    key: options.key,
    size: options.size,
  });

  return userStickerToClient(doc);
};

export const updateUserSticker = async (options: {
  userId: string;
  stickerId: string;
  name?: string;
  description?: string | null;
}) => {
  const sticker = await UserSticker.findOne({
    _id: new Types.ObjectId(options.stickerId),
    userId: new Types.ObjectId(options.userId),
  });
  if (!sticker) throw new NotFoundError('Sticker not found');

  if (typeof options.name === 'string') {
    const name = options.name.trim();
    if (!name) throw new BadRequestError('Sticker name cannot be empty');
    sticker.name = name;
  }

  if (options.description === null) {
    sticker.description = undefined;
  } else if (typeof options.description === 'string') {
    sticker.description = options.description.trim() || undefined;
  }

  await sticker.save();
  return userStickerToClient(sticker);
};

export const deleteUserSticker = async (options: { userId: string; stickerId: string }) => {
  const sticker = await UserSticker.findOne({
    _id: new Types.ObjectId(options.stickerId),
    userId: new Types.ObjectId(options.userId),
  }).lean();

  if (!sticker) throw new NotFoundError('Sticker not found');

  await UserSticker.deleteOne({ _id: sticker._id } as any);
  return { stickerId: options.stickerId, key: sticker.key };
};

