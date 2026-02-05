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

import userService from './user.service';
import { userRepository } from './user.repository';
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

