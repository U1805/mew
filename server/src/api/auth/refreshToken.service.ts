import crypto from 'crypto';
import mongoose from 'mongoose';
import RefreshToken, { IRefreshToken } from './refreshToken.model';
import config from '../../config';

const sha256Hex = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const generateToken = () => crypto.randomBytes(48).toString('base64url');

export type RefreshTokenCookieOptions = {
  maxAgeMs?: number;
  secure: boolean;
};

export const getRefreshTokenCookieName = () => 'mew_refresh_token';

export const buildRefreshTokenCookieOptions = (opts: RefreshTokenCookieOptions) => ({
  httpOnly: true,
  secure: opts.secure,
  sameSite: 'lax' as const,
  path: '/api/auth',
  ...(opts.maxAgeMs ? { maxAge: opts.maxAgeMs } : {}),
});

export const issueRefreshToken = async (params: {
  userId: mongoose.Types.ObjectId;
  createdByIp?: string | null;
  userAgent?: string | null;
  rememberMe?: boolean;
}) => {
  const raw = generateToken();
  const tokenHash = sha256Hex(raw);

  const ttlSeconds = config.refreshTokenExpiresSeconds;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const isPersistent = params.rememberMe === true;
  const doc = await RefreshToken.create({
    userId: params.userId,
    tokenHash,
    isPersistent,
    expiresAt,
    createdByIp: params.createdByIp ?? null,
    userAgent: params.userAgent ?? null,
  });

  const maxAgeMs = isPersistent ? ttlSeconds * 1000 : undefined;

  return { refreshToken: raw, refreshTokenId: doc._id, expiresAt, maxAgeMs, isPersistent };
};

export const rotateRefreshToken = async (params: {
  refreshToken: string;
  createdByIp?: string | null;
  userAgent?: string | null;
}) => {
  const now = new Date();
  const tokenHash = sha256Hex(params.refreshToken);
  const existing = await RefreshToken.findOne({ tokenHash }).select('_id userId expiresAt revokedAt replacedByTokenId isPersistent');
  if (!existing) return null;
  if (existing.expiresAt.getTime() <= now.getTime()) return null;

  // Refresh token reuse detection: using a revoked token strongly suggests theft.
  if (existing.revokedAt) {
    await RefreshToken.updateMany({ userId: existing.userId, revokedAt: null }, { $set: { revokedAt: now } });
    return null;
  }

  // Atomically "consume" the existing token to avoid multi-rotate races.
  const consumed = await RefreshToken.findOneAndUpdate(
    { _id: existing._id, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
    { new: true }
  ).select('_id userId isPersistent');
  if (!consumed) return null;

  const issued = await issueRefreshToken({
    userId: existing.userId,
    createdByIp: params.createdByIp ?? null,
    userAgent: params.userAgent ?? null,
    rememberMe: existing.isPersistent,
  });

  await RefreshToken.updateOne({ _id: existing._id }, { $set: { replacedByTokenId: issued.refreshTokenId } });

  return { userId: existing.userId, ...issued };
};

export const revokeRefreshToken = async (refreshToken: string) => {
  const tokenHash = sha256Hex(refreshToken);
  const existing = await RefreshToken.findOne({ tokenHash });
  if (!existing) return;
  if (existing.revokedAt) return;
  existing.revokedAt = new Date();
  await existing.save();
};

export const revokeAllRefreshTokensForUserId = async (userId: string | mongoose.Types.ObjectId) => {
  const id = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  const now = new Date();
  await RefreshToken.updateMany({ userId: id, revokedAt: null }, { $set: { revokedAt: now } });
};
