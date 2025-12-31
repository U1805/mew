import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

describe('utils/s3 (presign, stream upload, get object, cors skip)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('createPresignedPutUrl clamps expiresIn between 5 and 3600', async () => {
    const getSignedUrl = vi.fn().mockResolvedValue('https://signed');
    const S3Client = vi.fn().mockImplementation(function (this: any) {
      this.send = vi.fn();
    });

    vi.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl }));
    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client,
      PutObjectCommand: vi.fn(),
      GetObjectCommand: vi.fn(),
      PutBucketCorsCommand: vi.fn(),
    }));
    vi.doMock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }));
    vi.doMock('../config', () => ({
      default: {
        staticUrl: '',
        s3: {
          endpoint: 'api.local',
          webEndpoint: 'web.local',
          port: 3900,
          webPort: 3902,
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'b',
          useSsl: false,
          region: 'r',
          presignExpiresSeconds: 1,
          corsAllowedOrigins: ['*'],
        },
      },
    }));

    const mod1 = await import('./s3');
    await expect(mod1.createPresignedPutUrl({ key: 'a', contentType: 'text/plain' })).resolves.toBe('https://signed');
    expect(getSignedUrl).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ expiresIn: 5 }));

    vi.resetModules();
    vi.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl }));
    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client,
      PutObjectCommand: vi.fn(),
      GetObjectCommand: vi.fn(),
      PutBucketCorsCommand: vi.fn(),
    }));
    vi.doMock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }));
    vi.doMock('../config', () => ({
      default: {
        staticUrl: '',
        s3: {
          endpoint: 'api.local',
          webEndpoint: 'web.local',
          port: 3900,
          webPort: 3902,
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'b',
          useSsl: false,
          region: 'r',
          presignExpiresSeconds: 99999,
          corsAllowedOrigins: ['*'],
        },
      },
    }));

    const mod2 = await import('./s3');
    await mod2.createPresignedPutUrl({ key: 'b' });
    expect(getSignedUrl).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ expiresIn: 3600 }));
  });

  it('uploadStream counts bytes and returns metadata', async () => {
    const done = vi.fn();
    const Upload = vi.fn().mockImplementation(function (this: any, { params }: any) {
      done.mockImplementation(
        () =>
          new Promise<void>((resolve, reject) => {
            const body = params.Body;
            body.on('data', () => {});
            body.on('end', resolve);
            body.on('error', reject);
          })
      );
      return { done };
    });
    const nanoid = vi.fn().mockReturnValue('id');
    const S3Client = vi.fn().mockImplementation(function (this: any) {
      this.send = vi.fn();
    });

    vi.doMock('@aws-sdk/lib-storage', () => ({ Upload }));
    vi.doMock('nanoid', () => ({ nanoid }));
    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client,
      PutObjectCommand: vi.fn(),
      GetObjectCommand: vi.fn(),
      PutBucketCorsCommand: vi.fn(),
    }));
    vi.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));
    vi.doMock('../config', () => ({
      default: {
        staticUrl: '',
        s3: {
          endpoint: 'api.local',
          webEndpoint: 'web.local',
          port: 3900,
          webPort: 3902,
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'b',
          useSsl: false,
          region: 'r',
          presignExpiresSeconds: 60,
          corsAllowedOrigins: ['*'],
        },
      },
    }));

    const mod = await import('./s3');

    const stream = Readable.from([Buffer.from('hello'), Buffer.from('world')]);
    const res = await mod.uploadStream({ stream, originalname: 'a.txt', mimetype: 'text/plain' });

    expect(res).toEqual({ key: 'id.txt', mimetype: 'text/plain', size: 10 });
    expect(Upload).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
  });

  it('getObjectStream returns body + content headers', async () => {
    const send = vi.fn().mockResolvedValue({ Body: 'stream', ContentType: 'text/plain', ContentLength: 123 });
    const S3Client = vi.fn().mockImplementation(function (this: any) {
      this.send = send;
    });
    const GetObjectCommand = vi.fn();

    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client,
      GetObjectCommand,
      PutObjectCommand: vi.fn(),
      PutBucketCorsCommand: vi.fn(),
    }));
    vi.doMock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }));
    vi.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));
    vi.doMock('../config', () => ({
      default: {
        staticUrl: '',
        s3: {
          endpoint: 'api.local',
          webEndpoint: 'web.local',
          port: 3900,
          webPort: 3902,
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'b',
          useSsl: false,
          region: 'r',
          presignExpiresSeconds: 60,
          corsAllowedOrigins: ['*'],
        },
      },
    }));

    const mod = await import('./s3');
    const res = await mod.getObjectStream('k.png');
    expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: 'b', Key: 'k.png' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ body: 'stream', contentType: 'text/plain', contentLength: 123 });
  });

  it('configureBucketCors skips when allowed origins is empty', async () => {
    const send = vi.fn();
    const S3Client = vi.fn().mockImplementation(function (this: any) {
      this.send = send;
    });

    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client,
      PutBucketCorsCommand: vi.fn(),
      PutObjectCommand: vi.fn(),
      GetObjectCommand: vi.fn(),
    }));
    vi.doMock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }));
    vi.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));
    vi.doMock('../config', () => ({
      default: {
        staticUrl: '',
        s3: {
          endpoint: 'api.local',
          webEndpoint: 'web.local',
          port: 80,
          webPort: 80,
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'b',
          useSsl: false,
          region: 'r',
          presignExpiresSeconds: 60,
          corsAllowedOrigins: [],
        },
      },
    }));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('./s3');
    await expect(mod.configureBucketCors()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('getS3PublicUrl uses MEW_STATIC_URL override when set', async () => {
    vi.resetModules();

    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client: vi.fn().mockImplementation(function (this: any) {
        this.send = vi.fn();
      }),
      PutObjectCommand: vi.fn(),
      GetObjectCommand: vi.fn(),
      PutBucketCorsCommand: vi.fn(),
    }));
    vi.doMock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }));
    vi.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));
    vi.doMock('../config', () => ({
      default: {
        staticUrl: 'http://localhost:151/static/',
        s3: {
          endpoint: 'api.local',
          webEndpoint: 'web.local',
          port: 3900,
          webPort: 3902,
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'b',
          useSsl: false,
          region: 'r',
          presignExpiresSeconds: 60,
          corsAllowedOrigins: ['*'],
        },
      },
    }));

    const mod = await import('./s3');
    expect(mod.getS3PublicUrl('k.png')).toBe('http://localhost:151/static/k.png');
  });

  it('getS3PublicUrl rewrites Garage bucket URLs to MEW_STATIC_URL when set', async () => {
    vi.resetModules();

    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client: vi.fn().mockImplementation(function (this: any) {
        this.send = vi.fn();
      }),
      PutObjectCommand: vi.fn(),
      GetObjectCommand: vi.fn(),
      PutBucketCorsCommand: vi.fn(),
    }));
    vi.doMock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }));
    vi.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));
    vi.doMock('../config', () => ({
      default: {
        staticUrl: 'http://localhost:151/static/',
        s3: {
          endpoint: 'api.local',
          webEndpoint: 'web.garage.localhost',
          port: 3900,
          webPort: 80,
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'mew-bucket',
          useSsl: false,
          region: 'r',
          presignExpiresSeconds: 60,
          corsAllowedOrigins: ['*'],
        },
      },
    }));

    const mod = await import('./s3');
    expect(mod.getS3PublicUrl('http://mew-bucket.web.garage.localhost/HQgtYqX6Jl9F0Y3Fe0qnK.png')).toBe(
      'http://localhost:151/static/HQgtYqX6Jl9F0Y3Fe0qnK.png'
    );

    // Already on static base: keep as-is.
    expect(mod.getS3PublicUrl('http://localhost:151/static/HQgtYqX6Jl9F0Y3Fe0qnK.png')).toBe(
      'http://localhost:151/static/HQgtYqX6Jl9F0Y3Fe0qnK.png'
    );

    // Host mismatch: don't rewrite.
    expect(mod.getS3PublicUrl('http://example.com/HQgtYqX6Jl9F0Y3Fe0qnK.png')).toBe(
      'http://example.com/HQgtYqX6Jl9F0Y3Fe0qnK.png'
    );

    // Signed/parameterized URL: don't rewrite.
    expect(mod.getS3PublicUrl('http://mew-bucket.web.garage.localhost/HQgtYqX6Jl9F0Y3Fe0qnK.png?X-Amz-Signature=1')).toBe(
      'http://mew-bucket.web.garage.localhost/HQgtYqX6Jl9F0Y3Fe0qnK.png?X-Amz-Signature=1'
    );

    // Port mismatch: still rewrite (common when Garage Web is behind a reverse proxy / port mapping).
    expect(mod.getS3PublicUrl('http://mew-bucket.web.garage.localhost:81/HQgtYqX6Jl9F0Y3Fe0qnK.png')).toBe(
      'http://localhost:151/static/HQgtYqX6Jl9F0Y3Fe0qnK.png'
    );

    // Invalid URL: keep as-is.
    expect(mod.getS3PublicUrl('http://')).toBe('http://');
  });

  it('deleteObject sends DeleteObjectCommand', async () => {
    vi.resetModules();

    const send = vi.fn().mockResolvedValue({});
    const S3Client = vi.fn().mockImplementation(function (this: any) {
      this.send = send;
    });
    const DeleteObjectCommand = vi.fn();

    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client,
      DeleteObjectCommand,
      PutObjectCommand: vi.fn(),
      GetObjectCommand: vi.fn(),
      PutBucketCorsCommand: vi.fn(),
    }));
    vi.doMock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }));
    vi.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));
    vi.doMock('../config', () => ({
      default: {
        staticUrl: '',
        s3: {
          endpoint: 'api.local',
          webEndpoint: 'web.local',
          port: 3900,
          webPort: 3902,
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'b',
          useSsl: false,
          region: 'r',
          presignExpiresSeconds: 60,
          corsAllowedOrigins: ['*'],
        },
      },
    }));

    const mod = await import('./s3');
    await expect(mod.deleteObject(' k.png ')).resolves.toBeUndefined();
    expect(DeleteObjectCommand).toHaveBeenCalledWith({ Bucket: 'b', Key: 'k.png' });
    expect(send).toHaveBeenCalledTimes(1);

    await expect(mod.deleteObject('')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
