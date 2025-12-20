import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import config from '../config';
import { nanoid } from 'nanoid';
import path from 'path';
import { Transform } from 'stream';

const S3_ENDPOINT = `${config.s3.useSsl ? 'https' : 'http'}://${config.s3.endpoint}:${config.s3.port}`;
const S3_PUBLIC_BASE = `${config.s3.useSsl ? 'https' : 'http'}://${config.s3.bucketName}.${config.s3.webEndpoint}:${config.s3.webPort}`;

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
    const command = new PutBucketCorsCommand({
      Bucket: config.s3.bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*', 'authorization', 'content-type', 'x-amz-date', 'x-amz-security-token', 'x-amz-user-agent'],
            AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag', 'x-amz-request-id', 'x-amz-id-2'],
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
  // Don't re-hydrate a URL that is already complete.
  if (key.startsWith('http')) return key;
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
