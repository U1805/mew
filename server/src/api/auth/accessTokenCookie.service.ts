import type { CookieOptions } from 'express';
import type { SignOptions } from 'jsonwebtoken';

export const getAccessTokenCookieName = () => 'mew_access_token';

const parseExpiresInSeconds = (expiresIn: NonNullable<SignOptions['expiresIn']>, fallbackSeconds: number): number => {
  if (typeof expiresIn === 'number') return expiresIn;
  if (typeof expiresIn !== 'string') return fallbackSeconds;

  const trimmed = expiresIn.trim();
  if (!trimmed) return fallbackSeconds;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);

  const m = trimmed.match(/^(\d+)\s*([smhdw])$/i);
  if (!m) return fallbackSeconds;
  const n = Number.parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult =
    unit === 's'
      ? 1
      : unit === 'm'
        ? 60
        : unit === 'h'
          ? 60 * 60
          : unit === 'd'
            ? 60 * 60 * 24
            : unit === 'w'
              ? 60 * 60 * 24 * 7
              : 1;
  return Number.isFinite(n) ? n * mult : fallbackSeconds;
};

export const buildAccessTokenCookieOptions = (opts: {
  secure: boolean;
  isPersistent: boolean;
  jwtExpiresIn: NonNullable<SignOptions['expiresIn']>;
}): CookieOptions => {
  const maxAgeMs = opts.isPersistent ? parseExpiresInSeconds(opts.jwtExpiresIn, 60 * 30) * 1000 : undefined;
  return {
    httpOnly: true,
    secure: opts.secure,
    sameSite: 'lax',
    path: '/',
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
};

