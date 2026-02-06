import { describe, it, expect } from 'vitest';
import { readCookie } from './cookies';

describe('utils/cookies', () => {
  it('returns null when cookie header is missing', () => {
    expect(readCookie(undefined, 'a')).toBeNull();
  });

  it('reads and decodes a cookie value', () => {
    const header = 'x=1; mew_access_token=abc%2Fdef; y=2';
    expect(readCookie(header, 'mew_access_token')).toBe('abc/def');
  });

  it('returns null when cookie key is not present', () => {
    const header = 'a=1; b=2';
    expect(readCookie(header, 'c')).toBeNull();
  });

  it('returns null for malformed percent-encoding (no throw)', () => {
    const header = 'mew_access_token=%E0%A4%A';
    expect(readCookie(header, 'mew_access_token')).toBeNull();
  });
});
