import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nanoid } from 'nanoid';
import { NotFoundError } from '../../utils/errors';

vi.mock('nanoid', () => ({
  nanoid: vi.fn(),
}));

vi.mock('./bot.repository', () => ({
  create: vi.fn(),
  findByOwnerId: vi.fn(),
  findById: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn(),
  findByIdWithToken: vi.fn(),
}));

vi.mock('../../utils/s3', () => ({
  uploadFile: vi.fn(),
  getS3PublicUrl: vi.fn((key: string) => `http://cdn.local/${key}`),
}));

import * as botService from './bot.service';
import * as botRepository from './bot.repository';
import { uploadFile } from '../../utils/s3';

describe('bot.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nanoid).mockReturnValue('t'.repeat(32));
  });

  it('createBot returns accessToken on creation', async () => {
    const savedBot: any = {
      accessToken: 't'.repeat(32),
      toObject: () => ({ _id: 'b1', name: 'MyBot', ownerId: 'u1' }),
    };
    vi.mocked(botRepository.create).mockResolvedValue(savedBot);

    const result: any = await botService.createBot('u1', { name: 'MyBot' } as any);

    expect(botRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'MyBot',
        ownerId: 'u1',
        accessToken: 't'.repeat(32),
      })
    );
    expect(result.accessToken).toBe('t'.repeat(32));
  });

  it('createBot uploads avatar when provided', async () => {
    vi.mocked(uploadFile).mockResolvedValue({ key: 'avatar.png', mimetype: 'image/png', size: 3 } as any);
    const savedBot: any = {
      accessToken: 't'.repeat(32),
      toObject: () => ({ _id: 'b1', name: 'MyBot', ownerId: 'u1', avatarUrl: 'http://cdn.local/avatar.png' }),
    };
    vi.mocked(botRepository.create).mockResolvedValue(savedBot);

    const file = { originalname: 'a.png', mimetype: 'image/png', size: 3, buffer: Buffer.from('x') } as any;
    const result: any = await botService.createBot('u1', { name: 'MyBot' } as any, file);

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(botRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarUrl: 'http://cdn.local/avatar.png',
      })
    );
    expect(result.avatarUrl).toContain('http://cdn.local/');
  });

  it('updateBot strips accessToken from updates', async () => {
    vi.mocked(botRepository.findById).mockResolvedValue({ _id: 'b1' } as any);
    vi.mocked(botRepository.updateById).mockResolvedValue({ _id: 'b1', name: 'New' } as any);

    await botService.updateBot('b1', 'u1', { name: 'New', accessToken: 'hacked' } as any);

    const updateArg = vi.mocked(botRepository.updateById).mock.calls[0][2] as any;
    expect(updateArg.name).toBe('New');
    expect(updateArg.accessToken).toBeUndefined();
  });

  it('regenerateAccessToken throws when bot does not exist', async () => {
    vi.mocked(botRepository.findByIdWithToken).mockResolvedValue(null);
    await expect(botService.regenerateAccessToken('b1', 'u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('regenerateAccessToken updates token and saves', async () => {
    vi.mocked(nanoid).mockReturnValueOnce('n'.repeat(32));
    const botDoc: any = { accessToken: 'old', save: vi.fn().mockResolvedValue({}) };
    vi.mocked(botRepository.findByIdWithToken).mockResolvedValue(botDoc);

    const token = await botService.regenerateAccessToken('b1', 'u1');

    expect(token).toBe('n'.repeat(32));
    expect(botDoc.accessToken).toBe('n'.repeat(32));
    expect(botDoc.save).toHaveBeenCalledTimes(1);
  });
});

