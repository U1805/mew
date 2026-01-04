import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';

vi.mock('./userSticker.service', () => ({
  listUserStickers: vi.fn(),
  createUserStickerFromUpload: vi.fn(),
  updateUserSticker: vi.fn(),
  deleteUserSticker: vi.fn(),
}));

vi.mock('../../utils/s3', () => ({
  deleteObject: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue({ key: 'up.png', mimetype: 'image/png', size: 12 }),
}));

import * as userStickerService from './userSticker.service';
import {
  createMyStickerHandler,
  deleteMyStickerHandler,
  listMyStickersHandler,
  updateMyStickerHandler,
} from './userSticker.controller';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('api/userSticker/userSticker.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listMyStickersHandler requires auth', async () => {
    const req: any = { user: null };
    const res = makeRes();
    await expect(listMyStickersHandler(req, res)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('listMyStickersHandler returns list', async () => {
    vi.mocked(userStickerService.listUserStickers).mockResolvedValue([{ _id: 's1' }] as any);
    const req: any = { user: { id: 'u1' } };
    const res = makeRes();
    await listMyStickersHandler(req, res);
    expect(userStickerService.listUserStickers).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ _id: 's1' }]);
  });

  it('createMyStickerHandler requires auth', async () => {
    const req: any = { user: null };
    const res = makeRes();
    await expect(createMyStickerHandler(req, res)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('createMyStickerHandler requires file', async () => {
    const req: any = { user: { id: 'u1' } };
    const res = makeRes();
    await expect(createMyStickerHandler(req, res)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createMyStickerHandler forwards upload fields', async () => {
    vi.mocked(userStickerService.createUserStickerFromUpload).mockResolvedValue({ _id: 'st1' } as any);
    const req: any = {
      user: { id: 'u1' },
      body: { name: 'Wave', tags: 'hi hello', description: 'd' },
      file: { originalname: 'a.png', mimetype: 'image/png', size: 12, key: 'k.png' },
    };
    const res = makeRes();
    await createMyStickerHandler(req, res);

    const callArg = vi.mocked(userStickerService.createUserStickerFromUpload).mock.calls[0]?.[0] as any;
    expect(callArg).toEqual(expect.objectContaining({ userId: 'u1', name: 'Wave', description: 'd', key: 'k.png' }));
    expect(callArg.tags).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('createMyStickerHandler falls back to uploadFile when req.file.key is missing', async () => {
    vi.mocked(userStickerService.createUserStickerFromUpload).mockResolvedValue({ _id: 'st1' } as any);
    const req: any = {
      user: { id: 'u1' },
      body: { name: 'Wave', tags: 123 },
      file: { originalname: 'a.png', mimetype: 'image/png', size: 12 },
    };
    const res = makeRes();
    await createMyStickerHandler(req, res);

    const callArg = vi.mocked(userStickerService.createUserStickerFromUpload).mock.calls[0]?.[0] as any;
    expect(callArg).toEqual(expect.objectContaining({ key: 'up.png' }));
    expect(callArg.tags).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updateMyStickerHandler forwards update fields', async () => {
    vi.mocked(userStickerService.updateUserSticker).mockResolvedValue({ _id: 'st1' } as any);
    const req: any = {
      user: { id: 'u1' },
      params: { stickerId: 'st1' },
      body: { tags: 'a,b, c', name: 'N', description: null },
    };
    const res = makeRes();
    await updateMyStickerHandler(req, res);

    const callArg = vi.mocked(userStickerService.updateUserSticker).mock.calls[0]?.[0] as any;
    expect(callArg).toEqual(expect.objectContaining({ userId: 'u1', stickerId: 'st1', name: 'N', description: null }));
    expect(callArg.tags).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteMyStickerHandler deletes and returns stickerId', async () => {
    vi.mocked(userStickerService.deleteUserSticker).mockResolvedValue({ stickerId: 'st1', key: 'k.png' } as any);
    const req: any = { user: { id: 'u1' }, params: { stickerId: 'st1' } };
    const res = makeRes();
    await deleteMyStickerHandler(req, res);
    expect(userStickerService.deleteUserSticker).toHaveBeenCalledWith({ userId: 'u1', stickerId: 'st1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ stickerId: 'st1' });
  });
});

