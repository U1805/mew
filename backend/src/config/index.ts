import dotenv from 'dotenv';

dotenv.config();

const config = {
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/mew',
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'a-very-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || 86400,
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'localhost',
    webEndpoint: process.env.S3_WEB_ENDPOINT || 'web.garage.localhost',
    port: process.env.S3_PORT ? parseInt(process.env.S3_PORT, 10) : 3900, // API Port
    webPort: process.env.S3_WEB_PORT ? parseInt(process.env.S3_WEB_PORT, 10) : 3902, // Public Web Port
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'garage',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'garage-secret',
    bucketName: process.env.S3_BUCKET_NAME || 'mew',
    useSsl: (process.env.S3_USE_SSL || 'false').toLowerCase() === 'true',
    region: process.env.S3_REGION || 'garage',
  },
};

export default config;
