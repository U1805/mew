import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, NotFoundError } from '../../utils/errors';

vi.mock('./userSticker.model', () => ({
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

import UserSticker from './userSticker.model';
import * as userStickerService from './userSticker.service';

const makeFindQuery = (leanValue: any) => {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(leanValue),
  };
  return query;
};

describe('api/userSticker/userSticker.service', () => {
  const userId = '507f1f77bcf86cd799439012';
  const stickerId = '507f1f77bcf86cd799439013';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listUserStickers returns stickers with url and scope', async () => {
    vi.mocked((UserSticker as any).find).mockReturnValue(makeFindQuery([{ _id: 's1', userId, key: 'a.png' }]));
    const res: any = await userStickerService.listUserStickers(userId);
    expect(res[0].url).toBe('http://cdn.local/a.png');
    expect(res[0].scope).toBe('user');
    expect(res[0].ownerId).toBe(userId);
  });

  it('createUserStickerFromUpload validates name', async () => {
    await expect(
      userStickerService.createUserStickerFromUpload({
        userId,
        name: '   ',
        originalname: 'a.png',
        key: 'k.png',
        contentType: 'image/png',
        size: 1,
      })
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createUserStickerFromUpload infers format and persists', async () => {
    vi.mocked((UserSticker as any).create).mockResolvedValue({
      toObject: () => ({ _id: 'st1', userId, key: 'k.gif', name: 'Wave' }),
    });

    const res: any = await userStickerService.createUserStickerFromUpload({
      userId,
      name: 'Wave',
      originalname: 'wave.gif',
      key: 'k.gif',
      contentType: 'image/gif',
      size: 123,
    });

    expect((UserSticker as any).create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wave',
        format: 'gif',
        key: 'k.gif',
      })
    );
    expect(res.url).toBe('http://cdn.local/k.gif');
  });

  it('createUserStickerFromUpload infers webp from contentType/extension', async () => {
    vi.mocked((UserSticker as any).create).mockResolvedValue({
      toObject: () => ({ _id: 'st2', userId, key: 'k.webp', name: 'W' }),
    });

    await userStickerService.createUserStickerFromUpload({
      userId,
      name: 'W',
      originalname: 'w.webp',
      key: 'k.webp',
      contentType: 'image/webp',
      size: 1,
    });

    expect((UserSticker as any).create).toHaveBeenCalledWith(expect.objectContaining({ format: 'webp' }));

    vi.mocked((UserSticker as any).create).mockClear();
    await userStickerService.createUserStickerFromUpload({
      userId,
      name: 'W2',
      originalname: 'w2.webp',
      key: 'k2.webp',
      contentType: 'application/octet-stream',
      size: 1,
    });
    expect((UserSticker as any).create).toHaveBeenCalledWith(expect.objectContaining({ format: 'webp' }));
  });

  it('updateUserSticker throws NotFoundError when missing', async () => {
    vi.mocked((UserSticker as any).findOne).mockResolvedValue(null);
    await expect(userStickerService.updateUserSticker({ userId, stickerId, name: 'x' })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('updateUserSticker updates fields and returns url', async () => {
    const doc: any = {
      name: 'Old',
      description: 'd',
      save: vi.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: 'st1', userId, key: 'k.webp', name: doc.name, description: doc.description, tags: ['a'] }),
    };
    vi.mocked((UserSticker as any).findOne).mockResolvedValue(doc);

    const res: any = await userStickerService.updateUserSticker({
      userId,
      stickerId,
      name: ' New ',
      description: null,
    });

    expect(doc.name).toBe('New');
    expect(doc.description).toBeUndefined();
    expect((res as any).tags).toBeUndefined();
    expect(res.url).toBe('http://cdn.local/k.webp');
  });

  it('updateUserSticker applies string description branch', async () => {
    const doc: any = {
      description: undefined,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: 'st1', userId, key: 'k.png', description: doc.description }),
    };
    vi.mocked((UserSticker as any).findOne).mockResolvedValue(doc);

    const res: any = await userStickerService.updateUserSticker({
      userId,
      stickerId,
      description: '  hello  ',
    });
    expect(doc.description).toBe('hello');
    expect(res.url).toBe('http://cdn.local/k.png');
  });

  it('deleteUserSticker returns key and deletes record', async () => {
    vi.mocked((UserSticker as any).findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: stickerId, userId, key: 'k.png' }),
    });
    vi.mocked((UserSticker as any).deleteOne).mockResolvedValue({ acknowledged: true, deletedCount: 1 });

    const res = await userStickerService.deleteUserSticker({ userId, stickerId });
    expect((UserSticker as any).deleteOne).toHaveBeenCalledWith({ _id: stickerId });
    expect(res).toEqual({ stickerId, key: 'k.png' });
  });

  it('deleteUserSticker throws NotFoundError when missing', async () => {
    vi.mocked((UserSticker as any).findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    await expect(userStickerService.deleteUserSticker({ userId, stickerId })).rejects.toBeInstanceOf(NotFoundError);
  });
});

