import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, NotFoundError } from '../../utils/errors';

vi.mock('./sticker.model', () => ({
  default: {
    find: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

vi.mock('../../utils/s3', () => ({
  getS3PublicUrl: vi.fn((key: string) => `http://cdn.local/${key}`),
}));

import Sticker from './sticker.model';
import * as stickerService from './sticker.service';

const makeFindQuery = (leanValue: any) => {
  const query: any = {
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(leanValue),
  };
  return query;
};

describe('api/sticker/sticker.service', () => {
  const serverId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';
  const stickerId = '507f1f77bcf86cd799439013';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listStickers returns stickers with url', async () => {
    vi.mocked((Sticker as any).find).mockReturnValue(makeFindQuery([{ _id: 's1', key: 'a.png' }]));
    const res: any = await stickerService.listStickers(serverId);
    expect(res[0].url).toBe('http://cdn.local/a.png');
  });

  it('createStickerFromUpload validates name', async () => {
    await expect(
      stickerService.createStickerFromUpload({
        serverId,
        createdBy: userId,
        name: '   ',
        originalname: 'a.png',
        key: 'k.png',
        contentType: 'image/png',
        size: 1,
      })
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createStickerFromUpload infers format and persists', async () => {
    vi.mocked((Sticker as any).create).mockResolvedValue({
      toObject: () => ({ _id: 'st1', key: 'k.gif', name: 'Wave' }),
    });

    const res: any = await stickerService.createStickerFromUpload({
      serverId,
      createdBy: userId,
      name: 'Wave',
      originalname: 'wave.gif',
      key: 'k.gif',
      contentType: 'image/gif',
      size: 123,
    });

    expect((Sticker as any).create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wave',
        format: 'gif',
        key: 'k.gif',
      })
    );
    expect(res.url).toBe('http://cdn.local/k.gif');
  });

  it('createStickerFromUpload infers webp from contentType/extension', async () => {
    vi.mocked((Sticker as any).create).mockResolvedValue({
      toObject: () => ({ _id: 'st2', key: 'k.webp', name: 'W' }),
    });

    await stickerService.createStickerFromUpload({
      serverId,
      createdBy: userId,
      name: 'W',
      originalname: 'w.webp',
      key: 'k.webp',
      contentType: 'image/webp',
      size: 1,
    });

    expect((Sticker as any).create).toHaveBeenCalledWith(expect.objectContaining({ format: 'webp' }));

    vi.mocked((Sticker as any).create).mockClear();
    await stickerService.createStickerFromUpload({
      serverId,
      createdBy: userId,
      name: 'W2',
      originalname: 'w2.webp',
      key: 'k2.webp',
      contentType: 'application/octet-stream',
      size: 1,
    });
    expect((Sticker as any).create).toHaveBeenCalledWith(expect.objectContaining({ format: 'webp' }));
  });

  it('createStickerFromUpload infers jpg from contentType/extension', async () => {
    vi.mocked((Sticker as any).create).mockResolvedValue({
      toObject: () => ({ _id: 'st3', key: 'k.jpg', name: 'J' }),
    });

    await stickerService.createStickerFromUpload({
      serverId,
      createdBy: userId,
      name: 'J',
      originalname: 'j.jpg',
      key: 'k.jpg',
      contentType: 'image/jpeg',
      size: 1,
    });

    expect((Sticker as any).create).toHaveBeenCalledWith(expect.objectContaining({ format: 'jpg' }));

    vi.mocked((Sticker as any).create).mockClear();
    await stickerService.createStickerFromUpload({
      serverId,
      createdBy: userId,
      name: 'J2',
      originalname: 'j2.jpeg',
      key: 'k2.jpeg',
      contentType: 'application/octet-stream',
      size: 1,
    });

    expect((Sticker as any).create).toHaveBeenCalledWith(expect.objectContaining({ format: 'jpg' }));
  });

  it('updateSticker throws NotFoundError when missing', async () => {
    vi.mocked((Sticker as any).findOne).mockResolvedValue(null);
    await expect(stickerService.updateSticker({ serverId, stickerId, name: 'x' })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('updateSticker updates fields and returns url', async () => {
    const doc: any = {
      name: 'Old',
      description: 'd',
      save: vi.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: 'st1', key: 'k.webp', name: doc.name, description: doc.description, tags: ['a'] }),
    };
    vi.mocked((Sticker as any).findOne).mockResolvedValue(doc);

    const res: any = await stickerService.updateSticker({
      serverId,
      stickerId,
      name: ' New ',
      description: null,
    });

    expect(doc.name).toBe('New');
    expect(doc.description).toBeUndefined();
    expect((res as any).tags).toBeUndefined();
    expect(res.url).toBe('http://cdn.local/k.webp');
  });

  it('updateSticker applies string description branch', async () => {
    const doc: any = {
      description: undefined,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: 'st1', key: 'k.png', description: doc.description }),
    };
    vi.mocked((Sticker as any).findOne).mockResolvedValue(doc);

    const res: any = await stickerService.updateSticker({
      serverId,
      stickerId,
      description: '  hello  ',
    });
    expect(doc.description).toBe('hello');
    expect(res.url).toBe('http://cdn.local/k.png');
  });

  it('deleteSticker returns key and deletes record', async () => {
    vi.mocked((Sticker as any).findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: stickerId, key: 'k.png' }),
    });
    vi.mocked((Sticker as any).deleteOne).mockResolvedValue({ acknowledged: true, deletedCount: 1 });

    const res = await stickerService.deleteSticker({ serverId, stickerId });
    expect((Sticker as any).deleteOne).toHaveBeenCalledWith({ _id: stickerId });
    expect(res).toEqual({ stickerId, key: 'k.png' });
  });

  it('deleteSticker throws NotFoundError when missing', async () => {
    vi.mocked((Sticker as any).findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    await expect(stickerService.deleteSticker({ serverId, stickerId })).rejects.toBeInstanceOf(NotFoundError);
  });
});
