import type { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { readCookie } from '../utils/cookies';

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

  const origin = req.headers.origin;
  if (!origin) return next();

  const cookieToken = readCookie(req.headers.cookie, CSRF_COOKIE_NAME);
  const headerToken = readHeaderToken(req);

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return res.status(403).json({ message: 'Forbidden: CSRF token missing or invalid' });
  }

  return next();
};

