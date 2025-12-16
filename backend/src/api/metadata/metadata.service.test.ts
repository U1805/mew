import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('link-preview-js', () => ({
  getLinkPreview: vi.fn(),
}));

import dns from 'node:dns';
import { getLinkPreview } from 'link-preview-js';
import { extractFirstUrl, getLinkPreviewWithSafety } from './metadata.service';

describe('metadata.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractFirstUrl', () => {
    it('returns null for empty input', () => {
      expect(extractFirstUrl('')).toBeNull();
      expect(extractFirstUrl(null as any)).toBeNull();
    });

    it('extracts the first URL from text', () => {
      const text = 'hello https://example.com/path?a=1 and also https://second.com';
      expect(extractFirstUrl(text)).toBe('https://example.com/path?a=1');
    });
  });

  describe('getLinkPreviewWithSafety', () => {
    it('returns null when there is no URL in text', async () => {
      const result = await getLinkPreviewWithSafety('no links here');
      expect(result).toBeNull();
      expect(getLinkPreview).not.toHaveBeenCalled();
    });

    it('calls getLinkPreview with safety options and returns data on success', async () => {
      vi.mocked(getLinkPreview).mockResolvedValue({ title: 'Example' } as any);

      const result = await getLinkPreviewWithSafety('see https://example.com');

      expect(getLinkPreview).toHaveBeenCalledTimes(1);
      const [, options] = vi.mocked(getLinkPreview).mock.calls[0];
      expect(options).toEqual(
        expect.objectContaining({
          timeout: 3000,
          headers: expect.objectContaining({
            'User-Agent': expect.any(String),
            'Accept-Language': 'en-US,en;q=0.9',
          }),
          followRedirects: 'manual',
          resolveDNSHost: expect.any(Function),
          handleRedirects: expect.any(Function),
        })
      );
      expect(result).toEqual({ title: 'Example' });
    });

    it('handleRedirects only allows same-host (or www) http->https redirects', async () => {
      vi.mocked(getLinkPreview).mockResolvedValue({ ok: true } as any);
      await getLinkPreviewWithSafety('https://example.com');
      const [, options] = vi.mocked(getLinkPreview).mock.calls[0];
      const handleRedirects = (options as any).handleRedirects as (base: string, fwd: string) => boolean;

      expect(handleRedirects('http://example.com/a', 'https://example.com/b')).toBe(true);
      expect(handleRedirects('http://example.com/a', 'https://www.example.com/b')).toBe(true);
      expect(handleRedirects('http://www.example.com/a', 'https://example.com/b')).toBe(true);

      expect(handleRedirects('https://example.com/a', 'http://example.com/b')).toBe(false);
      expect(handleRedirects('http://example.com/a', 'https://evil.com/b')).toBe(false);
      expect(handleRedirects('not-a-url', 'still-not-a-url')).toBe(false);
    });

    it('resolveDNSHost rejects for invalid URL and resolves for valid host', async () => {
      vi.mocked(getLinkPreview).mockResolvedValue({ ok: true } as any);
      await getLinkPreviewWithSafety('https://example.com');
      const [, options] = vi.mocked(getLinkPreview).mock.calls[0];
      const resolveDNSHost = (options as any).resolveDNSHost as (url: string) => Promise<string>;

      await expect(resolveDNSHost('not-a-url')).rejects.toBeTruthy();

      const lookupSpy = vi.spyOn(dns, 'lookup').mockImplementation(((hostname: any, cb: any) => cb(null, '1.2.3.4')) as any);
      await expect(resolveDNSHost('https://example.com/path')).resolves.toBe('1.2.3.4');
      expect(lookupSpy).toHaveBeenCalledWith('example.com', expect.any(Function));
    });

    it('returns null and does not throw when getLinkPreview fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(getLinkPreview).mockRejectedValue(new Error('network'));

      const result = await getLinkPreviewWithSafety('https://example.com');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});

