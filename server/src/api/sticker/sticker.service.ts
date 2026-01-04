import { Types } from 'mongoose';
import Sticker, { ISticker, StickerFormat } from './sticker.model';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { getS3PublicUrl } from '../../utils/s3';

export type StickerForClient = Omit<
  ISticker,
  'serverId' | 'createdBy' | 'toObject' | 'populate' | 'save' | 'validate' | 'validateSync' | '$locals' | '$where' | 'collection'
> & {
  _id: any;
  scope: 'server';
  serverId: any;
  createdBy: any;
  url: string;
};

const inferFormat = (contentType: string, filename: string): StickerFormat => {
  const ct = (contentType || '').toLowerCase();
  if (ct === 'image/gif') return 'gif';
  if (ct === 'image/webp') return 'webp';
  if (ct === 'image/png') return 'png';

  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'gif') return 'gif';
  if (ext === 'webp') return 'webp';
  return 'png';
};

export const stickerToClient = (sticker: any) => {
  const obj = typeof sticker?.toObject === 'function' ? sticker.toObject() : sticker;
  const { tags: _tags, ...rest } = obj || {};
  return {
    ...rest,
    scope: 'server',
    url: obj?.key ? getS3PublicUrl(obj.key) : '',
  };
};

export const listStickers = async (serverId: string) => {
  const stickers = await Sticker.find({ serverId: new Types.ObjectId(serverId) }).sort({ createdAt: -1 }).lean();
  return stickers.map(stickerToClient);
};

export const createStickerFromUpload = async (options: {
  serverId: string;
  createdBy: string;
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

  const doc = await Sticker.create({
    serverId: new Types.ObjectId(options.serverId),
    createdBy: new Types.ObjectId(options.createdBy),
    name,
    description: options.description?.trim() || undefined,
    format,
    contentType: options.contentType,
    key: options.key,
    size: options.size,
  });

  return stickerToClient(doc);
};

export const updateSticker = async (options: {
  serverId: string;
  stickerId: string;
  name?: string;
  description?: string | null;
}) => {
  const sticker = await Sticker.findOne({
    _id: new Types.ObjectId(options.stickerId),
    serverId: new Types.ObjectId(options.serverId),
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
  return stickerToClient(sticker);
};

export const deleteSticker = async (options: { serverId: string; stickerId: string }) => {
  const sticker = await Sticker.findOne({
    _id: new Types.ObjectId(options.stickerId),
    serverId: new Types.ObjectId(options.serverId),
  }).lean();

  if (!sticker) throw new NotFoundError('Sticker not found');

  await Sticker.deleteOne({ _id: sticker._id } as any);
  return { stickerId: options.stickerId, key: sticker.key };
};

