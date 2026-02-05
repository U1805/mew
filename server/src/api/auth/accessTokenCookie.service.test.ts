import { describe, it, expect } from 'vitest';
import { buildAccessTokenCookieOptions, getAccessTokenCookieName } from './accessTokenCookie.service';

describe('accessTokenCookie.service', () => {
  it('uses a stable cookie name', () => {
    expect(getAccessTokenCookieName()).toBe('mew_access_token');
  });

  it('creates a session cookie when not persistent', () => {
    const opts = buildAccessTokenCookieOptions({ secure: false, isPersistent: false, jwtExpiresIn: '30m' });
    expect(opts.httpOnly).toBe(true);
    expect(opts.secure).toBe(false);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect((opts as any).maxAge).toBeUndefined();
  });

  it('sets maxAge for persistent cookies (numeric expiresIn)', () => {
    const opts = buildAccessTokenCookieOptions({ secure: true, isPersistent: true, jwtExpiresIn: 60 });
    expect(opts.secure).toBe(true);
    expect(opts.maxAge).toBe(60 * 1000);
  });

  it('sets maxAge for persistent cookies (duration string)', () => {
    const opts = buildAccessTokenCookieOptions({ secure: true, isPersistent: true, jwtExpiresIn: '2h' });
    expect(opts.maxAge).toBe(2 * 60 * 60 * 1000);
  });

  it('accepts numeric-string expiresIn', () => {
    const opts = buildAccessTokenCookieOptions({ secure: true, isPersistent: true, jwtExpiresIn: '900' });
    expect(opts.maxAge).toBe(900 * 1000);
  });

  it('falls back on unknown expiresIn strings', () => {
    const opts = buildAccessTokenCookieOptions({ secure: true, isPersistent: true, jwtExpiresIn: 'weird' as any });
    expect(opts.maxAge).toBe(60 * 30 * 1000);
  });
});

