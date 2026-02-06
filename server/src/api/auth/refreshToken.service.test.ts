import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../../config', () => ({
  default: {
    refreshTokenExpiresSeconds: 3600,
  },
}));

vi.mock('./refreshToken.model', () => ({
  default: {
    create: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
  },
}));

import RefreshToken from './refreshToken.model';
import {
  buildRefreshTokenCookieOptions,
  getRefreshTokenCookieName,
  issueRefreshToken,
  revokeAllRefreshTokensForUserId,
  revokeRefreshToken,
  rotateRefreshToken,
} from './refreshToken.service';

const mkId = () => new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');

describe('refreshToken.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a stable refresh cookie name', () => {
    expect(getRefreshTokenCookieName()).toBe('mew_refresh_token');
  });

  it('builds cookie options without maxAge when omitted', () => {
    const opts = buildRefreshTokenCookieOptions({ secure: false });
    expect(opts.httpOnly).toBe(true);
    expect(opts.secure).toBe(false);
    expect(opts.path).toBe('/api/auth');
    expect((opts as any).maxAge).toBeUndefined();
  });

  it('builds cookie options with maxAge when provided', () => {
    const opts = buildRefreshTokenCookieOptions({ secure: true, maxAgeMs: 1234 });
    expect(opts.secure).toBe(true);
    expect((opts as any).maxAge).toBe(1234);
  });

  it('issues a non-persistent refresh token', async () => {
    vi.mocked((RefreshToken as any).create).mockResolvedValue({ _id: mkId() });

    const result = await issueRefreshToken({ userId: mkId(), rememberMe: false, createdByIp: '1.1.1.1', userAgent: 'ua' });

    expect((RefreshToken as any).create).toHaveBeenCalledWith(
      expect.objectContaining({
        isPersistent: false,
        createdByIp: '1.1.1.1',
        userAgent: 'ua',
      })
    );
    expect(result.isPersistent).toBe(false);
    expect(result.maxAgeMs).toBeUndefined();
    expect(typeof result.refreshToken).toBe('string');
  });

  it('issues a persistent refresh token with maxAge', async () => {
    vi.mocked((RefreshToken as any).create).mockResolvedValue({ _id: mkId() });

    const result = await issueRefreshToken({ userId: mkId(), rememberMe: true });

    expect(result.isPersistent).toBe(true);
    expect(result.maxAgeMs).toBe(3600 * 1000);
  });

  it('rotateRefreshToken returns null when token is not found', async () => {
    vi.mocked((RefreshToken as any).findOne).mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
    await expect(rotateRefreshToken({ refreshToken: 'x' })).resolves.toBeNull();
  });

  it('rotateRefreshToken returns null when token is expired', async () => {
    vi.mocked((RefreshToken as any).findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: mkId(), userId: mkId(), expiresAt: new Date(Date.now() - 1000), revokedAt: null, isPersistent: true }),
    });

    await expect(rotateRefreshToken({ refreshToken: 'x' })).resolves.toBeNull();
  });

  it('rotateRefreshToken detects reuse for revoked token and revokes all active tokens', async () => {
    vi.mocked((RefreshToken as any).findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: mkId(), userId: mkId(), expiresAt: new Date(Date.now() + 10000), revokedAt: new Date(), isPersistent: true }),
    });

    const result = await rotateRefreshToken({ refreshToken: 'x' });
    expect(result).toBeNull();
    expect((RefreshToken as any).updateMany).toHaveBeenCalled();
  });

  it('rotateRefreshToken returns null when atomic consume fails', async () => {
    vi.mocked((RefreshToken as any).findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: mkId(), userId: mkId(), expiresAt: new Date(Date.now() + 10000), revokedAt: null, isPersistent: true }),
    });
    vi.mocked((RefreshToken as any).findOneAndUpdate).mockReturnValue({ select: vi.fn().mockResolvedValue(null) });

    await expect(rotateRefreshToken({ refreshToken: 'x' })).resolves.toBeNull();
  });

  it('rotateRefreshToken returns a new token and links replacement token id', async () => {
    const uid = mkId();
    vi.mocked((RefreshToken as any).findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: mkId(), userId: uid, expiresAt: new Date(Date.now() + 10000), revokedAt: null, isPersistent: true }),
    });
    vi.mocked((RefreshToken as any).findOneAndUpdate).mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: mkId(), userId: uid, isPersistent: true }) });
    vi.mocked((RefreshToken as any).create).mockResolvedValue({ _id: mkId() });

    const result = await rotateRefreshToken({ refreshToken: 'x', createdByIp: '2.2.2.2', userAgent: 'ua2' });

    expect(result).not.toBeNull();
    expect((result as any).userId).toEqual(uid);
    expect((RefreshToken as any).updateOne).toHaveBeenCalled();
  });

  it('revokeRefreshToken no-ops when token is not found', async () => {
    vi.mocked((RefreshToken as any).findOne).mockResolvedValue(null);
    await revokeRefreshToken('x');
    expect((RefreshToken as any).findOne).toHaveBeenCalled();
  });

  it('revokeRefreshToken no-ops when token is already revoked', async () => {
    const save = vi.fn();
    vi.mocked((RefreshToken as any).findOne).mockResolvedValue({ revokedAt: new Date(), save });

    await revokeRefreshToken('x');
    expect(save).not.toHaveBeenCalled();
  });

  it('revokeRefreshToken sets revokedAt and saves when active', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const doc: any = { revokedAt: null, save };
    vi.mocked((RefreshToken as any).findOne).mockResolvedValue(doc);

    await revokeRefreshToken('x');
    expect(doc.revokedAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalled();
  });

  it('revokeAllRefreshTokensForUserId revokes by ObjectId', async () => {
    await revokeAllRefreshTokensForUserId('507f1f77bcf86cd799439011');
    expect((RefreshToken as any).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(mongoose.Types.ObjectId), revokedAt: null }),
      expect.objectContaining({ $set: expect.objectContaining({ revokedAt: expect.any(Date) }) })
    );
  });
});
