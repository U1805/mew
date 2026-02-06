import type { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { readCookie } from '../utils/cookies';
import { getAccessTokenCookieName } from '../api/auth/accessTokenCookie.service';
import { getRefreshTokenCookieName } from '../api/auth/refreshToken.service';

const CSRF_COOKIE_NAME = 'mew_csrf_token';
const CSRF_HEADER_NAME = 'x-mew-csrf-token';

const isSecureCookie = () => (process.env.NODE_ENV || '').toLowerCase() === 'production';

export const getCsrfCookieName = () => CSRF_COOKIE_NAME;
export const getCsrfHeaderName = () => CSRF_HEADER_NAME;

export const buildCsrfCookieOptions = (opts: { secure: boolean }) => ({
  httpOnly: false,
  secure: opts.secure,
  sameSite: 'lax' as const,
  path: '/',
});

const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

const readHeaderToken = (req: Request): string | null => {
  const v = req.headers[CSRF_HEADER_NAME];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return null;
};

export const csrfCookieHandler = (req: Request, res: Response) => {
  const token = crypto.randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE_NAME, token, buildCsrfCookieOptions({ secure: isSecureCookie() }));
  return res.status(204).send();
};

// Double-submit cookie CSRF: require header token to match cookie token.
// Only enforced when `Origin` is present (i.e. typical browser requests).
export const requireCsrf: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const method = (req.method || '').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const path = String(req.path || '').toLowerCase();
  const isSessionMutationPath = path === '/refresh' || path === '/refresh-cookie' || path === '/logout';
  const hasAccessCookie = !!readCookie(req.headers.cookie, getAccessTokenCookieName());
  const hasRefreshCookie = !!readCookie(req.headers.cookie, getRefreshTokenCookieName());
  const origin = req.headers.origin;
  // Always enforce CSRF for endpoints that mutate auth session state.
  // Otherwise, enforce when request looks browser-originated or carries auth cookies.
  if (!isSessionMutationPath && !origin && !hasAccessCookie && !hasRefreshCookie) return next();

  const cookieToken = readCookie(req.headers.cookie, CSRF_COOKIE_NAME);
  const headerToken = readHeaderToken(req);

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return res.status(403).json({ message: 'Forbidden: CSRF token missing or invalid' });
  }

  return next();
};
