import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../utils/errors';

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock('../../utils/s3', () => ({
  getS3PublicUrl: vi.fn((key: string) => `http://cdn.local/${key}`),
}));

vi.mock('./user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
    find: vi.fn(),
    findByIdWithPassword: vi.fn(),
    updateById: vi.fn(),
  },
}));

vi.mock('../auth/refreshToken.service', () => ({
  revokeAllRefreshTokensForUserId: vi.fn(),
}));

vi.mock('../bot/bot.model', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('./user.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../channel/channelNotificationSetting.model', () => ({
  UserChannelNotificationSetting: {
    find: vi.fn(),
  },
}));

import userService from './user.service';
import { userRepository } from './user.repository';
import BotModel from '../bot/bot.model';
import UserModel from './user.model';
import { UserChannelNotificationSetting } from '../channel/channelNotificationSetting.model';
import { revokeAllRefreshTokensForUserId } from '../auth/refreshToken.service';

describe('user.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getUserById returns only public fields and hydrates avatarUrl', async () => {
    const doc: any = {
      toObject: () => ({
        _id: 'u1',
        username: 'alice',
        avatarUrl: 'avatar.png',
        isBot: false,
        createdAt: new Date('2020-01-01'),
        email: 'secret@example.com',
      }),
    };
    vi.mocked(userRepository.findById).mockResolvedValue(doc);

    const result: any = await userService.getUserById('u1');

    expect(result).toEqual(
      expect.objectContaining({
        _id: 'u1',
        username: 'alice',
        avatarUrl: 'http://cdn.local/avatar.png',
        isBot: false,
      })
    );
    expect(result.email).toBeUndefined();
  });

  it('getMe throws when user is missing', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null);
    await expect(userService.getMe('u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getMe hydrates avatar when present', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({
      toObject: () => ({ _id: 'u1', username: 'alice', avatarUrl: 'a.png' }),
    } as any);
    const me: any = await userService.getMe('u1');
    expect(me.avatarUrl).toBe('http://cdn.local/a.png');
  });

  it('getMyNotificationSettings returns defaults when fields are absent', async () => {
    vi.mocked((UserModel as any).findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ notificationSettings: {} }) }),
    });
    const settings = await userService.getMyNotificationSettings('u1');
    expect(settings).toEqual({ soundEnabled: true, soundVolume: 0.6, desktopEnabled: false });
  });

  it('getMyNotificationSettings throws when user does not exist', async () => {
    vi.mocked((UserModel as any).findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    await expect(userService.getMyNotificationSettings('u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updateMyNotificationSettings merges partial updates with current values', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked((UserModel as any).findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({
        notificationSettings: { soundEnabled: false, soundVolume: 0.3, desktopEnabled: true },
        save,
      }),
    });

    const next = await userService.updateMyNotificationSettings('u1', { soundVolume: 0.9 });
    expect(next).toEqual({ soundEnabled: false, soundVolume: 0.9, desktopEnabled: true });
    expect(save).toHaveBeenCalled();
  });

  it('listMyChannelNotificationSettings maps rows to client shape', async () => {
    vi.mocked((UserChannelNotificationSetting as any).find).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { channelId: { toString: () => 'c1' }, level: 'ALL' },
        { channelId: { toString: () => 'c2' }, level: 'MENTIONS' },
      ]),
    });

    const rows = await userService.listMyChannelNotificationSettings('507f191e810c19729de860ea');
    expect(rows).toEqual([
      { channelId: 'c1', level: 'ALL' },
      { channelId: 'c2', level: 'MENTIONS' },
    ]);
  });

  it('searchUsers filters out bots that are not dmEnabled', async () => {
    const users = [
      {
        _id: { toString: () => 'u2' },
        isBot: false,
        toObject: () => ({ _id: { toString: () => 'u2' }, username: 'alice', discriminator: '0001', avatarUrl: 'a.png', isBot: false }),
      },
      {
        _id: { toString: () => 'b1' },
        isBot: true,
        toObject: () => ({ _id: { toString: () => 'b1' }, username: 'bot1', discriminator: '0002', avatarUrl: 'b.png', isBot: true }),
      },
      {
        _id: { toString: () => 'b2' },
        isBot: true,
        toObject: () => ({ _id: { toString: () => 'b2' }, username: 'bot2', discriminator: '0003', avatarUrl: '', isBot: true }),
      },
    ] as any;
    vi.mocked(userRepository.find).mockResolvedValue(users);
    vi.mocked((BotModel as any).find).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ botUserId: { toString: () => 'b1' }, dmEnabled: false }, { botUserId: { toString: () => 'b2' }, dmEnabled: true }]),
    });

    const result: any = await userService.searchUsers('a', 'u1');
    expect(result.map((u: any) => u.username)).toEqual(['alice', 'bot2']);
    expect(result.find((u: any) => u.username === 'bot2')?.dmEnabled).toBe(true);
  });

  it('getUserById includes dmEnabled for bot users', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({
      toObject: () => ({
        _id: { toString: () => 'b1' },
        username: 'bot',
        discriminator: '0001',
        avatarUrl: 'bot.png',
        isBot: true,
        createdAt: new Date('2020-01-01'),
      }),
    } as any);
    vi.mocked((BotModel as any).findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ dmEnabled: true }) }),
    });

    const result: any = await userService.getUserById('b1');
    expect(result.isBot).toBe(true);
    expect(result.dmEnabled).toBe(true);
  });

  it('updateMe retries with cleared discriminator on duplicate username key error', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce({ name: 'MongoServerError', code: 11000 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const doc: any = {
      username: 'old',
      discriminator: '0001',
      avatarUrl: 'a.png',
      save,
      toObject: () => ({ _id: 'u1', username: 'newname', avatarUrl: 'new.png' }),
    };
    vi.mocked((UserModel as any).findById).mockReturnValue({
      select: vi.fn().mockResolvedValue(doc),
    });

    const updated: any = await userService.updateMe('u1', { username: 'newname', avatarUrl: 'new.png' });
    expect(updated.avatarUrl).toBe('http://cdn.local/new.png');
    expect(save).toHaveBeenCalledTimes(3);
    expect(doc.discriminator).toBeUndefined();
  });

  it('updateMe maps duplicate key errors to ConflictError', async () => {
    vi.mocked((UserModel as any).findById).mockReturnValue({
      select: vi.fn().mockRejectedValue({ name: 'MongoServerError', code: 11000, keyPattern: { email: 1 } }),
    });
    await expect(userService.updateMe('u1', { username: 'x' })).rejects.toThrow('Email already exists.');
  });

  it('changePassword requires old/new passwords', async () => {
    await expect(userService.changePassword('u1', '', 'new')).rejects.toBeInstanceOf(BadRequestError);
    await expect(userService.changePassword('u1', 'old', '')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('changePassword throws when user not found', async () => {
    vi.mocked(userRepository.findByIdWithPassword).mockResolvedValue(null);
    await expect(userService.changePassword('u1', 'old', 'new')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('changePassword throws when old password is invalid', async () => {
    vi.mocked(userRepository.findByIdWithPassword).mockResolvedValue({ password: 'hashed' } as any);
    vi.mocked((bcrypt as any).compare).mockResolvedValue(false);

    await expect(userService.changePassword('u1', 'old', 'new')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('changePassword throws when new password equals old password', async () => {
    vi.mocked(userRepository.findByIdWithPassword).mockResolvedValue({ password: 'hashed' } as any);
    vi.mocked((bcrypt as any).compare).mockResolvedValue(true);

    await expect(userService.changePassword('u1', 'same', 'same')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('changePassword hashes and persists new password', async () => {
    vi.mocked(userRepository.findByIdWithPassword).mockResolvedValue({ password: 'hashed' } as any);
    vi.mocked((bcrypt as any).compare).mockResolvedValue(true);
    vi.mocked((bcrypt as any).hash).mockResolvedValue('hashed-new');
    vi.mocked(userRepository.updateById).mockResolvedValue({} as any);

    await userService.changePassword('u1', 'old', 'new');

    expect(bcrypt.hash).toHaveBeenCalledWith('new', 10);
    expect(userRepository.updateById).toHaveBeenCalledWith('u1', { password: 'hashed-new' });
    expect(revokeAllRefreshTokensForUserId).toHaveBeenCalledWith('u1');
  });
});

