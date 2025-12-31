import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';

vi.mock('./sticker.service', () => ({
  listStickers: vi.fn(),
  createStickerFromUpload: vi.fn(),
  updateSticker: vi.fn(),
  deleteSticker: vi.fn(),
}));

vi.mock('../../utils/s3', () => ({
  deleteObject: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue({ key: 'up.png', mimetype: 'image/png', size: 12 }),
  getS3PublicUrl: vi.fn((key: string) => `http://cdn.local/${key}`),
}));

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcast: vi.fn(),
  },
}));

import * as stickerService from './sticker.service';
import { socketManager } from '../../gateway/events';
import {
  createStickerHandler,
  deleteStickerHandler,
  listStickersHandler,
  updateStickerHandler,
} from './sticker.controller';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('api/sticker/sticker.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listStickersHandler returns list', async () => {
    vi.mocked(stickerService.listStickers).mockResolvedValue([{ _id: 's1' }] as any);
    const req: any = { params: { serverId: 'sv' } };
    const res = makeRes();
    await listStickersHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ _id: 's1' }]);
  });

  it('createStickerHandler requires auth', async () => {
    const req: any = { params: { serverId: 'sv' }, user: null };
    const res = makeRes();
    await expect(createStickerHandler(req, res)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('createStickerHandler requires file', async () => {
    const req: any = { params: { serverId: 'sv' }, user: { id: 'u1' } };
    const res = makeRes();
    await expect(createStickerHandler(req, res)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createStickerHandler parses tags and broadcasts', async () => {
    vi.mocked(stickerService.createStickerFromUpload).mockResolvedValue({ _id: 'st1', serverId: 'sv' } as any);
    const req: any = {
      params: { serverId: 'sv' },
      user: { id: 'u1' },
      body: { name: 'Wave', tags: 'hi hello', description: 'd' },
      file: { originalname: 'a.png', mimetype: 'image/png', size: 12, key: 'k.png' },
    };
    const res = makeRes();
    await createStickerHandler(req, res);

    expect(stickerService.createStickerFromUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['hi', 'hello'],
        name: 'Wave',
        key: 'k.png',
      })
    );
    expect(socketManager.broadcast).toHaveBeenCalledWith('STICKER_CREATE', 'sv', expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('createStickerHandler falls back to uploadFile when req.file.key is missing', async () => {
    vi.mocked(stickerService.createStickerFromUpload).mockResolvedValue({ _id: 'st1', serverId: 'sv' } as any);
    const req: any = {
      params: { serverId: 'sv' },
      user: { id: 'u1' },
      body: { name: 'Wave', tags: 123 },
      file: { originalname: 'a.png', mimetype: 'image/png', size: 12 },
    };
    const res = makeRes();
    await createStickerHandler(req, res);

    // tags: number => parseTags returns []
    expect(stickerService.createStickerFromUpload).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [], key: 'up.png' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updateStickerHandler accepts comma-separated tags', async () => {
    vi.mocked(stickerService.updateSticker).mockResolvedValue({ _id: 'st1', serverId: 'sv' } as any);
    const req: any = { params: { serverId: 'sv', stickerId: 'st1' }, body: { tags: 'a,b, c', name: 'N' } };
    const res = makeRes();
    await updateStickerHandler(req, res);

    expect(stickerService.updateSticker).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['a', 'b', 'c'],
        name: 'N',
      })
    );
    expect(socketManager.broadcast).toHaveBeenCalledWith('STICKER_UPDATE', 'sv', expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteStickerHandler broadcasts delete', async () => {
    vi.mocked(stickerService.deleteSticker).mockResolvedValue({ stickerId: 'st1', key: 'k.png' } as any);
    const req: any = { params: { serverId: 'sv', stickerId: 'st1' } };
    const res = makeRes();
    await deleteStickerHandler(req, res);
    expect(socketManager.broadcast).toHaveBeenCalledWith('STICKER_DELETE', 'sv', { stickerId: 'st1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ stickerId: 'st1' });
  });
});
