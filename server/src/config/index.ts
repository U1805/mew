import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

type S3Credentials = { accessKeyId: string; secretAccessKey: string };

const readS3CredentialsFile = (): S3Credentials | null => {
  const p = process.env.S3_CREDENTIALS_FILE;
  if (!p) return null;

  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as Partial<S3Credentials>;
    if (!parsed?.accessKeyId || !parsed?.secretAccessKey) return null;
    return { accessKeyId: parsed.accessKeyId, secretAccessKey: parsed.secretAccessKey };
  } catch {
    return null;
  }
};

const fileCreds = readS3CredentialsFile();

const config = {
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/mew',
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'a-very-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || 86400,
  adminSecret: process.env.MEW_ADMIN_SECRET || '',
  infraAllowedIps: (process.env.MEW_INFRA_ALLOWED_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'localhost',
    webEndpoint: process.env.S3_WEB_ENDPOINT || 'web.garage.localhost',
    port: process.env.S3_PORT ? parseInt(process.env.S3_PORT, 10) : 3900, // API Port
    webPort: process.env.S3_WEB_PORT ? parseInt(process.env.S3_WEB_PORT, 10) : 3902, // Public Web Port
    accessKeyId: process.env.S3_ACCESS_KEY_ID || fileCreds?.accessKeyId || 'garage',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || fileCreds?.secretAccessKey || 'garage-secret',
    bucketName: process.env.S3_BUCKET_NAME || 'mew',
    useSsl: (process.env.S3_USE_SSL || 'false').toLowerCase() === 'true',
    region: process.env.S3_REGION || 'garage',
  },
};

export default config;
