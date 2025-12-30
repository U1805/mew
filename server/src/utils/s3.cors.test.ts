import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('utils/s3 (configureBucketCors, getS3PublicUrl)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getS3PublicUrl returns empty string for empty key and preserves full URLs', async () => {
    vi.doMock('../config', () => ({
      default: {
        staticUrl: '',
        s3: { useSsl: false, bucketName: 'b', webEndpoint: 'cdn.local', webPort: 3902, endpoint: 'api', port: 3900, region: 'r', accessKeyId: 'k', secretAccessKey: 's' },
      },
    }));
    const mod = await import('./s3');
    expect(mod.getS3PublicUrl('')).toBe('');
    expect(mod.getS3PublicUrl('http://x/y.png')).toBe('http://x/y.png');
  });

  it('getS3PublicUrl builds URL from config and supports ssl', async () => {
    vi.doMock('../config', () => ({
      default: {
        staticUrl: '',
        s3: { useSsl: true, bucketName: 'mew', webEndpoint: 'web.local', webPort: 443, endpoint: 'api', port: 3900, region: 'r', accessKeyId: 'k', secretAccessKey: 's' },
      },
    }));
    const mod = await import('./s3');
    expect(mod.getS3PublicUrl('k.png')).toBe('https://mew.web.local/k.png');
  });

  it('configureBucketCors swallows errors and does not throw', async () => {
    const send = vi.fn().mockRejectedValue(new Error('down'));
    const PutBucketCorsCommand = vi.fn();
    const S3Client = vi.fn().mockImplementation(function (this: any) {
      this.send = send;
    });

    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client,
      PutBucketCorsCommand,
    }));

    vi.doMock('../config', () => ({
      default: {
        staticUrl: '',
        s3: { useSsl: false, bucketName: 'mew', webEndpoint: 'web.local', webPort: 3902, endpoint: 'api.local', port: 3900, region: 'r', accessKeyId: 'k', secretAccessKey: 's' },
      },
    }));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await import('./s3');
    await expect(mod.configureBucketCors()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('configureBucketCors sends config and logs on success', async () => {
    const send = vi.fn().mockResolvedValue({});
    const PutBucketCorsCommand = vi.fn();
    const S3Client = vi.fn().mockImplementation(function (this: any) {
      this.send = send;
    });

    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client,
      PutBucketCorsCommand,
      PutObjectCommand: vi.fn(),
      GetObjectCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }));
    vi.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));

    vi.doMock('../config', () => ({
      default: {
        staticUrl: '',
        s3: {
          useSsl: false,
          bucketName: 'mew',
          webEndpoint: 'web.local',
          webPort: 3902,
          endpoint: 'api.local',
          port: 3900,
          region: 'r',
          accessKeyId: 'k',
          secretAccessKey: 's',
          corsAllowedOrigins: ['http://a.local'],
          presignExpiresSeconds: 60,
        },
      },
    }));

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import('./s3');
    await expect(mod.configureBucketCors()).resolves.toBeUndefined();
    expect(PutBucketCorsCommand).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
