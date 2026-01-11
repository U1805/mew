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

  const doc = await RefreshToken.create({
    userId: params.userId,
    tokenHash,
    expiresAt,
    createdByIp: params.createdByIp ?? null,
    userAgent: params.userAgent ?? null,
  });

  const maxAgeMs = params.rememberMe === false ? undefined : ttlSeconds * 1000;

  return { refreshToken: raw, refreshTokenId: doc._id, expiresAt, maxAgeMs };
};

export const rotateRefreshToken = async (params: {
  refreshToken: string;
  createdByIp?: string | null;
  userAgent?: string | null;
  rememberMe?: boolean;
}) => {
  const tokenHash = sha256Hex(params.refreshToken);
  const existing = await RefreshToken.findOne({ tokenHash });
  if (!existing) return null;
  if (existing.revokedAt) return null;
  if (existing.expiresAt.getTime() <= Date.now()) return null;

  const issued = await issueRefreshToken({
    userId: existing.userId,
    createdByIp: params.createdByIp ?? null,
    userAgent: params.userAgent ?? null,
    rememberMe: params.rememberMe,
  });

  existing.revokedAt = new Date();
  existing.replacedByTokenId = issued.refreshTokenId;
  await existing.save();

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

