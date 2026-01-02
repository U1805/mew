import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';

vi.mock('./bot.service', () => ({
  getBotById: vi.fn(),
}));

vi.mock('../userSticker/userSticker.service', () => ({
  listUserStickers: vi.fn(),
  createUserStickerFromUpload: vi.fn(),
  updateUserSticker: vi.fn(),
  deleteUserSticker: vi.fn(),
}));

vi.mock('../../utils/s3', () => ({
  deleteObject: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue({ key: 'up.png', mimetype: 'image/png', size: 12 }),
}));

import * as botService from './bot.service';
import * as userStickerService from '../userSticker/userSticker.service';
import {
  createBotStickerHandler,
  deleteBotStickerHandler,
  listBotStickersHandler,
  updateBotStickerHandler,
} from './bot.sticker.controller';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('api/bot/bot.sticker.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked((botService as any).getBotById).mockResolvedValue({ botUserId: 'u-bot' } as any);
  });

  it('requires auth', async () => {
    const req: any = { user: null, params: { botId: 'b1' } };
    const res = makeRes();
    await expect(listBotStickersHandler(req, res)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('listBotStickersHandler returns list', async () => {
    vi.mocked(userStickerService.listUserStickers).mockResolvedValue([{ _id: 's1' }] as any);
    const req: any = { user: { id: 'u1' }, params: { botId: 'b1' } };
    const res = makeRes();
    await listBotStickersHandler(req, res);
    expect(botService.getBotById).toHaveBeenCalledWith('b1', 'u1');
    expect(userStickerService.listUserStickers).toHaveBeenCalledWith('u-bot');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ _id: 's1' }]);
  });

  it('createBotStickerHandler requires file', async () => {
    const req: any = { user: { id: 'u1' }, params: { botId: 'b1' } };
    const res = makeRes();
    await expect(createBotStickerHandler(req, res)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createBotStickerHandler falls back to uploadFile when key is missing', async () => {
    vi.mocked(userStickerService.createUserStickerFromUpload).mockResolvedValue({ _id: 'st1' } as any);
    const req: any = {
      user: { id: 'u1' },
      params: { botId: 'b1' },
      body: { name: 'Wave', tags: 'hi' },
      file: { originalname: 'a.png', mimetype: 'image/png', size: 12 },
    };
    const res = makeRes();
    await createBotStickerHandler(req, res);

    expect(userStickerService.createUserStickerFromUpload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-bot', name: 'Wave', key: 'up.png', tags: ['hi'] })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updateBotStickerHandler passes tags/name', async () => {
    vi.mocked(userStickerService.updateUserSticker).mockResolvedValue({ _id: 'st1' } as any);
    const req: any = {
      user: { id: 'u1' },
      params: { botId: 'b1', stickerId: 'st1' },
      body: { name: 'N', tags: 'a,b' },
    };
    const res = makeRes();
    await updateBotStickerHandler(req, res);
    expect(userStickerService.updateUserSticker).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-bot', stickerId: 'st1', name: 'N', tags: ['a', 'b'] })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteBotStickerHandler deletes and returns stickerId', async () => {
    vi.mocked(userStickerService.deleteUserSticker).mockResolvedValue({ stickerId: 'st1', key: 'k.png' } as any);
    const req: any = { user: { id: 'u1' }, params: { botId: 'b1', stickerId: 'st1' } };
    const res = makeRes();
    await deleteBotStickerHandler(req, res);
    expect(userStickerService.deleteUserSticker).toHaveBeenCalledWith({ userId: 'u-bot', stickerId: 'st1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ stickerId: 'st1' });
  });
});
