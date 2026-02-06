import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nanoid } from 'nanoid';
import { BadRequestError, NotFoundError } from '../../utils/errors';

vi.mock('nanoid', () => ({
  nanoid: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
  },
}));

vi.mock('./bot.repository', () => ({
  create: vi.fn(),
  findByOwnerId: vi.fn(),
  findById: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn(),
  findByIdWithToken: vi.fn(),
  findByServiceTypeWithToken: vi.fn(),
  findByIdWithTokenUnscoped: vi.fn(),
  updateByIdForBotUserId: vi.fn(),
}));

vi.mock('../../utils/s3', () => ({
  uploadFile: vi.fn(),
  getS3PublicUrl: vi.fn((key: string) => `http://cdn.local/${key}`),
}));

vi.mock('../infra/serviceType.model', () => ({
  default: {
    exists: vi.fn(),
  },
}));

vi.mock('../user/user.model', () => {
  const userSave = vi.fn().mockResolvedValue({ _id: 'u-bot' });

  const UserModelMock: any = vi.fn(function (this: any, data: any) {
    Object.assign(this, data);
    this._id = 'u-bot';
    this.save = userSave;
  });

  UserModelMock.exists = vi.fn().mockResolvedValue(false);
  UserModelMock.findById = vi.fn((id: string) => ({
    select: vi.fn().mockResolvedValue(
      id
        ? {
            _id: id,
            username: 'OldBotName',
            avatarUrl: null,
            save: vi.fn().mockResolvedValue({}),
          }
        : null
    ),
  }));

  return { default: UserModelMock };
});

import * as botService from './bot.service';
import * as botRepository from './bot.repository';
import { uploadFile } from '../../utils/s3';
import ServiceTypeModel from '../infra/serviceType.model';
import { encryptBotAccessToken, hashBotAccessToken } from './botAccessToken.crypto';
import config from '../../config';

describe('bot.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nanoid).mockReturnValue('t'.repeat(32));
    vi.mocked((ServiceTypeModel as any).exists).mockResolvedValue(true);
  });

  it('createBot returns accessToken on creation', async () => {
    const savedBot: any = {
      accessToken: hashBotAccessToken('t'.repeat(32)),
      accessTokenEnc: 'enc',
      serviceType: 'rss-fetcher',
      _id: 'b1',
      save: vi.fn().mockResolvedValue({}),
      toObject: () => ({ _id: 'b1', name: 'MyBot', ownerId: 'u1', serviceType: 'rss-fetcher' }),
    };
    vi.mocked(botRepository.create).mockResolvedValue(savedBot);

    const result: any = await botService.createBot('u1', { name: 'MyBot', serviceType: 'rss-fetcher' } as any);

    expect(botRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'MyBot',
        ownerId: 'u1',
        accessToken: hashBotAccessToken('t'.repeat(32)),
        serviceType: 'rss-fetcher',
      })
    );
    expect(result.accessToken).toBe('t'.repeat(32));
  });

  it('createBot uploads avatar when provided', async () => {
    const savedBot: any = {
      accessToken: hashBotAccessToken('t'.repeat(32)),
      accessTokenEnc: 'enc',
      serviceType: 'rss-fetcher',
      _id: 'b1',
      save: vi.fn().mockResolvedValue({}),
      toObject: () => ({ _id: 'b1', name: 'MyBot', ownerId: 'u1', serviceType: 'rss-fetcher', avatarUrl: 'http://cdn.local/avatar.png' }),
    };
    vi.mocked(botRepository.create).mockResolvedValue(savedBot);

    const file = { originalname: 'a.png', mimetype: 'image/png', size: 3, key: 'avatar.png' } as any;
    const result: any = await botService.createBot('u1', { name: 'MyBot', serviceType: 'rss-fetcher' } as any, file);

    expect(uploadFile).not.toHaveBeenCalled();
    expect(botRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarUrl: 'http://cdn.local/avatar.png',
      })
    );
    expect(result.avatarUrl).toContain('http://cdn.local/');
  });

  it('updateBot strips accessToken from updates', async () => {
    vi.mocked(botRepository.findById).mockResolvedValue({ _id: 'b1', serviceType: 'rss-fetcher', botUserId: 'u-bot' } as any);
    vi.mocked(botRepository.updateById).mockResolvedValue({ _id: 'b1', name: 'New', serviceType: 'rss-fetcher', botUserId: 'u-bot', save: vi.fn().mockResolvedValue({}) } as any);

    await botService.updateBot('b1', 'u1', { name: 'New', accessToken: 'hacked', serviceType: 'rss-fetcher' } as any);

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
    const botDoc: any = { accessToken: hashBotAccessToken('old'), accessTokenEnc: 'enc', save: vi.fn().mockResolvedValue({}) };
    vi.mocked(botRepository.findByIdWithToken).mockResolvedValue(botDoc);

    const token = await botService.regenerateAccessToken('b1', 'u1');

    expect(token).toBe('n'.repeat(32));
    expect(botDoc.accessToken).toBe(hashBotAccessToken('n'.repeat(32)));
    expect(botDoc.save).toHaveBeenCalledTimes(1);
  });

  it('bootstrapBots returns bots with tokens', async () => {
    vi.mocked(botRepository.findByServiceTypeWithToken).mockResolvedValue([
      // Legacy-style bot (plaintext token, no accessTokenEnc) should still be bootstrappable.
      { _id: 'b1', name: 'Bot1', config: '{}', accessToken: 't'.repeat(32), accessTokenEnc: '', serviceType: 'rss-fetcher', dmEnabled: false } as any,
    ]);

    const result = await botService.bootstrapBots('rss-fetcher');
    expect(result).toEqual([
      expect.objectContaining({ _id: 'b1', serviceType: 'rss-fetcher', accessToken: 't'.repeat(32) }),
    ]);
  });

  it('bootstrapBots decrypts encrypted tokens (v2 storage)', async () => {
    const raw = 't'.repeat(32);
    const keyMaterial = (config as any).botTokenEncKey || (config as any).adminSecret || (config as any).jwtSecret;
    const enc = encryptBotAccessToken(raw, String(keyMaterial));
    vi.mocked(botRepository.findByServiceTypeWithToken).mockResolvedValue([
      { _id: 'b1', name: 'Bot1', config: '{}', accessToken: hashBotAccessToken(raw), accessTokenEnc: enc, serviceType: 'rss-fetcher', dmEnabled: false } as any,
    ]);

    const result: any = await botService.bootstrapBots('rss-fetcher');
    expect(result[0].accessToken).toBe(raw);
  });

  it('createBot throws when serviceType is missing', async () => {
    await expect(botService.createBot('u1', { name: 'MyBot' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createBot throws when serviceType is unknown', async () => {
    vi.mocked((ServiceTypeModel as any).exists).mockResolvedValue(false);
    await expect(botService.createBot('u1', { name: 'MyBot', serviceType: 'unknown' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('updateBot uploads avatar when file has no key', async () => {
    vi.mocked(botRepository.findById).mockResolvedValue({ _id: 'b1', serviceType: 'rss-fetcher', botUserId: 'u-bot' } as any);
    vi.mocked(uploadFile as any).mockResolvedValue({ key: 'uploaded.png' });
    vi.mocked(botRepository.updateById).mockResolvedValue({
      _id: 'b1',
      name: 'New',
      serviceType: 'rss-fetcher',
      botUserId: 'u-bot',
      toObject: () => ({ _id: 'b1', name: 'New', serviceType: 'rss-fetcher', avatarUrl: 'http://cdn.local/uploaded.png' }),
      save: vi.fn().mockResolvedValue({}),
    } as any);

    const file = { originalname: 'a.png', mimetype: 'image/png', size: 10 } as any;
    const result: any = await botService.updateBot('b1', 'u1', { name: 'New', serviceType: 'rss-fetcher' } as any, file);
    expect(uploadFile).toHaveBeenCalledWith(file);
    expect(result.avatarUrl).toContain('uploaded.png');
  });

  it('updateBot throws when updated bot is unexpectedly null', async () => {
    vi.mocked(botRepository.findById).mockResolvedValue({ _id: 'b1', serviceType: 'rss-fetcher', botUserId: 'u-bot' } as any);
    vi.mocked(botRepository.updateById).mockResolvedValue(null as any);
    await expect(botService.updateBot('b1', 'u1', { name: 'New', serviceType: 'rss-fetcher' } as any)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deleteBot throws when bot is missing', async () => {
    vi.mocked(botRepository.deleteById).mockResolvedValue(null as any);
    await expect(botService.deleteBot('b1', 'u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('bootstrapBots throws when token is not recoverable', async () => {
    vi.mocked(botRepository.findByServiceTypeWithToken).mockResolvedValue([
      { _id: 'b1', name: 'Bot1', config: '{}', accessToken: 'x'.repeat(64), accessTokenEnc: '', serviceType: 'rss-fetcher', dmEnabled: false } as any,
    ]);
    await expect(botService.bootstrapBots('rss-fetcher')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('bootstrapBotById validates existence and expectedServiceType', async () => {
    vi.mocked(botRepository.findByIdWithTokenUnscoped).mockResolvedValueOnce(null as any);
    await expect(botService.bootstrapBotById('b1')).rejects.toBeInstanceOf(NotFoundError);

    vi.mocked(botRepository.findByIdWithTokenUnscoped).mockResolvedValueOnce({
      _id: 'b1',
      name: 'Bot1',
      config: '{}',
      accessToken: 't'.repeat(32),
      accessTokenEnc: '',
      serviceType: 'rss-fetcher',
      dmEnabled: false,
    } as any);
    await expect(botService.bootstrapBotById('b1', 'twitter-fetcher')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('bootstrapBotById returns normalized serviceType and token', async () => {
    vi.mocked(botRepository.findByIdWithTokenUnscoped).mockResolvedValue({
      _id: 'b1',
      name: 'Bot1',
      config: '{}',
      accessToken: 't'.repeat(32),
      accessTokenEnc: '',
      serviceType: undefined,
      dmEnabled: true,
      save: vi.fn().mockResolvedValue(undefined),
    } as any);
    const r: any = await botService.bootstrapBotById('b1');
    expect(r.serviceType).toBe('rss-fetcher');
    expect(r.accessToken).toBe('t'.repeat(32));
    expect(r.dmEnabled).toBe(true);
  });

  it('updateBotConfigAsBot validates ownership and writes merged config', async () => {
    vi.mocked(botRepository.findByIdWithTokenUnscoped)
      .mockResolvedValueOnce(null as any)
      .mockResolvedValueOnce({ _id: 'b1', botUserId: 'u-other', config: '{}', serviceType: 'rss-fetcher' } as any)
      .mockResolvedValueOnce({ _id: 'b1', botUserId: 'u-bot', config: '{bad-json', serviceType: 'rss-fetcher' } as any)
      .mockResolvedValueOnce({ _id: 'b1', botUserId: 'u-bot', config: '{"foo":"bar"}', serviceType: 'rss-fetcher' } as any);

    vi.mocked(botRepository.updateByIdForBotUserId)
      .mockResolvedValueOnce(null as any)
      .mockResolvedValueOnce({ _id: 'b1', serviceType: 'rss-fetcher', config: '{"system_prompt":"p1"}' } as any)
      .mockResolvedValueOnce({ _id: 'b1', serviceType: 'rss-fetcher', config: '{"foo":"bar","system_prompt":"p2"}' } as any);

    await expect(botService.updateBotConfigAsBot('b1', 'u-bot', { system_prompt: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(botService.updateBotConfigAsBot('b1', 'u-bot', { system_prompt: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(botService.updateBotConfigAsBot('b1', 'u-bot', { system_prompt: 'p1' })).rejects.toBeInstanceOf(NotFoundError);

    const updated: any = await botService.updateBotConfigAsBot('b1', 'u-bot', { system_prompt: 'p2' });
    expect(updated).toBeDefined();

    const firstUpdateArg = vi.mocked(botRepository.updateByIdForBotUserId).mock.calls[0]?.[2] as any;
    const secondUpdateArg = vi.mocked(botRepository.updateByIdForBotUserId).mock.calls[1]?.[2] as any;
    expect(firstUpdateArg.config).toContain('"system_prompt":"p1"');
    expect(secondUpdateArg.config).toContain('"foo":"bar"');
    expect(secondUpdateArg.config).toContain('"system_prompt":"p2"');
  });
});
