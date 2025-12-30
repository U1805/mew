import { describe, it, expect, vi, afterEach } from 'vitest';

describe('constants/upload', () => {
  const original = process.env.LIMIT_FILE_SIZE;

  afterEach(() => {
    process.env.LIMIT_FILE_SIZE = original;
  });

  it('defaults to 50MB when LIMIT_FILE_SIZE is missing or invalid', async () => {
    process.env.LIMIT_FILE_SIZE = '';
    vi.resetModules();
    const mod1 = await import('./upload');
    expect(mod1.MAX_UPLOAD_MB).toBe(50);

    process.env.LIMIT_FILE_SIZE = '0';
    vi.resetModules();
    const mod2 = await import('./upload');
    expect(mod2.MAX_UPLOAD_MB).toBe(50);

    process.env.LIMIT_FILE_SIZE = 'not-a-number';
    vi.resetModules();
    const mod3 = await import('./upload');
    expect(mod3.MAX_UPLOAD_MB).toBe(50);
  });

  it('parses LIMIT_FILE_SIZE and derives MAX_UPLOAD_BYTES', async () => {
    process.env.LIMIT_FILE_SIZE = '12.5';
    vi.resetModules();
    const mod = await import('./upload');
    expect(mod.MAX_UPLOAD_MB).toBe(12.5);
    expect(mod.MAX_UPLOAD_BYTES).toBe(Math.floor(12.5 * 1024 * 1024));
  });
});

