import { GetObjectCommand, PutObjectCommand, S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../config';
import { nanoid } from 'nanoid';
import path from 'path';
import { Transform } from 'stream';

const protocol = config.s3.useSsl ? 'https' : 'http';
const buildBaseUrl = (host: string, port: number): string => {
  if ((protocol === 'http' && port === 80) || (protocol === 'https' && port === 443)) {
    return `${protocol}://${host}`;
  }
  return `${protocol}://${host}:${port}`;
};

const normalizeStaticBaseUrl = (raw: string | undefined): string | null => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
};

const S3_ENDPOINT = buildBaseUrl(config.s3.endpoint, config.s3.port);
const S3_PUBLIC_BASE = buildBaseUrl(`${config.s3.bucketName}.${config.s3.webEndpoint}`, config.s3.webPort);
const STATIC_PUBLIC_BASE = normalizeStaticBaseUrl((config as any).staticUrl);

const rewriteS3PublicUrlToStaticUrl = (rawUrl: string): string | null => {
  if (!STATIC_PUBLIC_BASE) return null;

  try {
    const u = new URL(rawUrl);
    // Avoid rewriting signed URLs / parameterized URLs.
    if (u.search || u.hash) return null;

    // If the URL is already on the configured static base (even if protocol/port differs),
    // normalize it to exactly `${MEW_STATIC_URL}/<key>` so callers always get the reachable external URL.
    const staticBase = new URL(`${STATIC_PUBLIC_BASE}/`);
    if (u.hostname === staticBase.hostname && u.pathname.startsWith(staticBase.pathname)) {
      const key = u.pathname.slice(staticBase.pathname.length).replace(/^\/+/, '');
      return key ? `${STATIC_PUBLIC_BASE}/${key}` : STATIC_PUBLIC_BASE;
    }

    const s3Base = new URL(`${S3_PUBLIC_BASE}/`);
    if (u.hostname !== s3Base.hostname) return null;

    const key = u.pathname.replace(/^\/+/, '');
    if (!key) return null;

    return `${STATIC_PUBLIC_BASE}/${key}`;
  } catch {
    return null;
  }
};

const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  forcePathStyle: true, // Necessary for MinIO, Garage, etc.
});

export const configureBucketCors = async () => {
  try {
    const allowedOrigins = Array.isArray((config as any)?.s3?.corsAllowedOrigins)
      ? (config as any).s3.corsAllowedOrigins
      : ['*'];
    if (allowedOrigins.length === 0) {
      console.warn('[S3] Skipping bucket CORS config: no allowed origins configured (set S3_CORS_ORIGINS or MEW_CORS_ORIGINS).');
      return;
    }

    const command = new PutBucketCorsCommand({
      Bucket: config.s3.bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            // Allow browser uploads via pre-signed PUT (PUT) and public reads (GET/HEAD).
            AllowedMethods: ['GET', 'HEAD', 'PUT'],
            AllowedOrigins: allowedOrigins,
            AllowedHeaders: [
              'authorization',
              'content-type',
              'x-amz-acl',
              'x-amz-content-sha256',
              'x-amz-date',
              'x-amz-security-token',
              'x-amz-user-agent',
            ],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    });

    await s3Client.send(command);
    console.log(`S3 CORS configured for bucket: ${config.s3.bucketName}`);
  } catch (error) {
    console.error('Failed to configure S3 CORS:', error);
    // 不抛出错误，以免阻断服务器启动，Garage 可能尚未就绪
  }
};

// Helper to convert a stored S3 key into a full, publicly accessible URL.
export const getS3PublicUrl = (key: string): string => {
  if (!key) return '';
  // If a URL is already complete, keep it, but allow rewriting known Garage bucket URLs to MEW_STATIC_URL.
  if (key.startsWith('http')) return rewriteS3PublicUrlToStaticUrl(key) ?? key;
  if (STATIC_PUBLIC_BASE) return `${STATIC_PUBLIC_BASE}/${key}`;
  return `${S3_PUBLIC_BASE}/${key}`;
};

export const uploadFile = async (file: Express.Multer.File) => {
  const fileExtension = path.extname(file.originalname);
  const newFilename = `${nanoid()}${fileExtension}`;

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: config.s3.bucketName,
      Key: newFilename,
      Body: file.buffer,
      ContentType: file.mimetype,
    },
  });

  await upload.done();

  return { key: newFilename, mimetype: file.mimetype, size: file.size };
};

export const createPresignedPutUrl = async (opts: { key: string; contentType?: string }) => {
  const command = new PutObjectCommand({
    Bucket: config.s3.bucketName,
    Key: opts.key,
    ContentType: opts.contentType || undefined,
  });

  // Some AWS SDK packages can pull in mismatched `@smithy/types` versions under pnpm, which breaks TS assignability.
  // Runtime compatibility is unaffected; cast to unblock compilation.
  const url = await getSignedUrl(s3Client as any, command as any, {
    expiresIn: Math.max(5, Math.min(config.s3.presignExpiresSeconds, 3600)),
  });

  return url;
};

class ByteCounter extends Transform {
  public bytes = 0;

  _transform(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null, data?: any) => void) {
    this.bytes += chunk?.length ?? 0;
    callback(null, chunk);
  }
}

export const uploadStream = async (options: {
  stream: NodeJS.ReadableStream;
  originalname: string;
  mimetype: string;
}) => {
  const fileExtension = path.extname(options.originalname);
  const newFilename = `${nanoid()}${fileExtension}`;

  const counter = new ByteCounter();
  options.stream.pipe(counter);

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: config.s3.bucketName,
      Key: newFilename,
      Body: counter,
      ContentType: options.mimetype,
    },
  });

  await upload.done();

  return { key: newFilename, mimetype: options.mimetype, size: counter.bytes };
};

export const getObjectStream = async (key: string) => {
  const command = new GetObjectCommand({
    Bucket: config.s3.bucketName,
    Key: key,
  });

  const resp = await s3Client.send(command);
  return {
    body: resp.Body,
    contentType: resp.ContentType,
    contentLength: resp.ContentLength,
  };
};
