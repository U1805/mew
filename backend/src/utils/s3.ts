import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import config from '../config';
import { nanoid } from 'nanoid';
import path from 'path';

const s3Client = new S3Client({
  endpoint: `${config.s3.useSsl ? 'https' : 'http'}://${config.s3.endpoint}:${config.s3.port}`,
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
