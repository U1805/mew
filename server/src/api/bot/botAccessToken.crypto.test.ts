import { describe, it, expect } from 'vitest';
import { decryptBotAccessToken, encryptBotAccessToken, hashBotAccessToken } from './botAccessToken.crypto';

describe('api/bot/botAccessToken.crypto', () => {
  it('hashBotAccessToken returns a 64-char hex string', () => {
    const h = hashBotAccessToken('test-token');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('encryptBotAccessToken/decryptBotAccessToken round-trip', () => {
    const raw = 't'.repeat(32);
    const keyMaterial = 'k'.repeat(32);
    const enc = encryptBotAccessToken(raw, keyMaterial);
    const dec = decryptBotAccessToken(enc, keyMaterial);
    expect(dec).toBe(raw);
  });

  it('decryptBotAccessToken throws for invalid ciphertext format', () => {
    expect(() => decryptBotAccessToken('nope', 'k')).toThrow();
  });
});

