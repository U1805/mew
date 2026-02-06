import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, ConflictError, UnauthorizedError } from '../../utils/errors';

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('jwt-token'),
  },
}));

vi.mock('../user/user.repository', () => ({
  userRepository: {
    findByEmailWithPassword: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../bot/bot.repository', () => ({
  findByAccessToken: vi.fn(),
}));

vi.mock('../bot/bot.service', () => ({
  ensureBotUserExists: vi.fn(),
}));

vi.mock('../../utils/s3', () => ({
  getS3PublicUrl: vi.fn((k: string) => `http://cdn.local/${k}`),
}));

vi.mock('../bot/botAccessToken.crypto', () => ({
  encryptBotAccessToken: vi.fn().mockReturnValue('enc-token'),
  hashBotAccessToken: vi.fn((raw: string) => `hash-${raw}`),
}));

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userRepository } from '../user/user.repository';
import * as botRepository from '../bot/bot.repository';
import { ensureBotUserExists } from '../bot/bot.service';
import { encryptBotAccessToken, hashBotAccessToken } from '../bot/botAccessToken.crypto';
import { login, loginBot, register, signAccessToken } from './auth.service';

describe('api/auth/auth.service (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked((jwt as any).sign).mockReturnValue('jwt-token');
  });

  it('signAccessToken delegates to jwt.sign', () => {
    const token = signAccessToken({ id: 'u1', username: 'alice' } as any);
    expect(token).toBe('jwt-token');
    expect(jwt.sign).toHaveBeenCalled();
  });

  it('login validates password presence', async () => {
    await expect(login({ email: 'a@b.com', password: '' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('login rejects unknown users and bot users', async () => {
    vi.mocked(userRepository.findByEmailWithPassword).mockResolvedValueOnce(null as any);
    await expect(login({ email: 'a@b.com', password: 'x' } as any)).rejects.toBeInstanceOf(UnauthorizedError);

    vi.mocked(userRepository.findByEmailWithPassword).mockResolvedValueOnce({ isBot: true } as any);
    await expect(login({ email: 'a@b.com', password: 'x' } as any)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('login rejects wrong password', async () => {
    vi.mocked(userRepository.findByEmailWithPassword).mockResolvedValue({ password: 'hashed', isBot: false } as any);
    vi.mocked((bcrypt as any).compare).mockResolvedValue(false);
    await expect(login({ email: 'a@b.com', password: 'x' } as any)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('login lazy-migrates missing discriminator and hydrates avatar', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const userDoc: any = {
      _id: 'u1',
      username: 'alice',
      password: 'hashed',
      avatarUrl: 'a.png',
      discriminator: undefined,
      save,
      toObject: () => ({ _id: 'u1', username: 'alice', avatarUrl: 'a.png' }),
    };
    vi.mocked(userRepository.findByEmailWithPassword).mockResolvedValue(userDoc);
    vi.mocked((bcrypt as any).compare).mockResolvedValue(true);

    const result: any = await login({ email: '  A@B.com  ', password: 'pw' } as any);
    expect(userRepository.findByEmailWithPassword).toHaveBeenCalledWith('a@b.com');
    expect(save).toHaveBeenCalled();
    expect(result.user.avatarUrl).toBe('http://cdn.local/a.png');
    expect(result.token).toBe('jwt-token');
  });

  it('loginBot validates access token and missing bot user', async () => {
    await expect(loginBot({ accessToken: '' })).rejects.toBeInstanceOf(BadRequestError);

    vi.mocked((botRepository as any).findByAccessToken).mockResolvedValue(null);
    await expect(loginBot({ accessToken: 'x' })).rejects.toBeInstanceOf(UnauthorizedError);

    vi.mocked((botRepository as any).findByAccessToken).mockResolvedValue({ botUserId: null } as any);
    vi.mocked(ensureBotUserExists as any).mockResolvedValue(undefined);
    await expect(loginBot({ accessToken: 'x' })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('loginBot migrates legacy token and still succeeds when save throws', async () => {
    const botDoc: any = {
      accessToken: 'x'.repeat(32),
      accessTokenEnc: '',
      botUserId: { toString: () => 'u-bot' },
      save: vi.fn().mockRejectedValue(new Error('ignore')),
    };
    vi.mocked((botRepository as any).findByAccessToken).mockResolvedValue(botDoc);
    vi.mocked(ensureBotUserExists as any).mockResolvedValue(undefined);
    vi.mocked(userRepository.findById).mockResolvedValue({
      _id: 'u-bot',
      username: 'bot',
      discriminator: '0001',
      avatarUrl: 'bot.png',
      toObject: () => ({ _id: 'u-bot', username: 'bot', avatarUrl: 'bot.png' }),
    } as any);

    const result: any = await loginBot({ accessToken: 'x'.repeat(32) });
    expect(encryptBotAccessToken).toHaveBeenCalled();
    expect(hashBotAccessToken).toHaveBeenCalled();
    expect(result.user.avatarUrl).toBe('http://cdn.local/bot.png');
    expect(result.token).toBe('jwt-token');
  });

  it('loginBot throws when bot user cannot be loaded', async () => {
    vi.mocked((botRepository as any).findByAccessToken).mockResolvedValue({
      accessToken: 'hash-x',
      accessTokenEnc: 'enc',
      botUserId: { toString: () => 'u-bot' },
      save: vi.fn(),
    } as any);
    vi.mocked(ensureBotUserExists as any).mockResolvedValue(undefined);
    vi.mocked(userRepository.findById).mockResolvedValue(null as any);
    await expect(loginBot({ accessToken: 'x' })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('loginBot lazy-migrates missing discriminator on bot user', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked((botRepository as any).findByAccessToken).mockResolvedValue({
      accessToken: 'hash-x',
      accessTokenEnc: 'enc',
      botUserId: { toString: () => 'u-bot' },
      save: vi.fn(),
    } as any);
    vi.mocked(ensureBotUserExists as any).mockResolvedValue(undefined);
    vi.mocked(userRepository.findById).mockResolvedValue({
      _id: 'u-bot',
      username: 'bot',
      discriminator: undefined,
      save,
      toObject: () => ({ _id: 'u-bot', username: 'bot' }),
    } as any);

    await loginBot({ accessToken: 'x' });
    expect(save).toHaveBeenCalled();
  });

  it('register validates password and normalizes fields', async () => {
    await expect(register({ email: 'a@b.com', username: 'x' } as any)).rejects.toBeInstanceOf(BadRequestError);

    vi.mocked((bcrypt as any).hash).mockResolvedValue('hashed');
    vi.mocked(userRepository.create).mockResolvedValue({
      _id: 'u1',
      username: 'alice',
      discriminator: '0001',
      toObject: () => ({ _id: 'u1', username: 'alice', avatarUrl: 'a.png' }),
    } as any);

    const result: any = await register({ email: '  A@B.com ', username: ' alice ', password: 'pw' } as any);
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com', username: 'alice', password: 'hashed', isBot: false })
    );
    expect(result.user.avatarUrl).toBe('http://cdn.local/a.png');
  });

  it('register maps duplicate key errors to ConflictError', async () => {
    vi.mocked((bcrypt as any).hash).mockResolvedValue('hashed');
    vi.mocked(userRepository.create).mockRejectedValue({
      name: 'MongoServerError',
      code: 11000,
      keyPattern: { email: 1 },
    });
    await expect(register({ email: 'a@b.com', username: 'x', password: 'pw' } as any)).rejects.toBeInstanceOf(ConflictError);
  });
});
