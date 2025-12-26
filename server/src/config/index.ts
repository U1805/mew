import dotenv from 'dotenv';
import fs from 'fs';
import type { SignOptions } from 'jsonwebtoken';

dotenv.config();

type S3Credentials = { accessKeyId: string; secretAccessKey: string };

type TrustProxySetting = boolean | number | string;

const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

const parsePort = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseJwtExpiresIn = (raw: string | undefined): NonNullable<SignOptions['expiresIn']> => {
  if (!raw) return 86400;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  return trimmed as NonNullable<SignOptions['expiresIn']>;
};

const parseBoolean = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseCsv = (raw: string | undefined): string[] =>
  (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const parseTrustProxy = (raw: string | undefined): TrustProxySetting => {
  if (raw === undefined || raw === null || raw.trim() === '') {
    // Safer default than `true`: only trust loopback proxies.
    return 'loopback';
  }

  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  if (/^\d+$/.test(normalized)) return Number.parseInt(normalized, 10);
  return raw.trim();
};

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
  env: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/mew',
  port: parsePort(process.env.PORT, 3000),
  jwtSecret: process.env.JWT_SECRET || (isProduction ? '' : 'dev-jwt-secret'),
  jwtExpiresIn: parseJwtExpiresIn(process.env.JWT_EXPIRES_IN),
  allowUserRegistration: parseBoolean(process.env.MEW_ALLOW_USER_REGISTRATION, true),
  adminSecret: process.env.MEW_ADMIN_SECRET || '',
  trustProxy: parseTrustProxy(process.env.MEW_TRUST_PROXY || process.env.TRUST_PROXY),
  cors: {
    allowedOriginsRaw: process.env.MEW_CORS_ORIGINS || '',
    allowedOrigins: [] as string[],
    allowAnyOrigin: false,
  },
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
    corsAllowedOrigins: [] as string[],
    presignExpiresSeconds: parsePort(process.env.S3_PRESIGN_EXPIRES_SECONDS, 60),
  },
};

// Derive CORS allowlist.
const corsOrigins = parseCsv(config.cors.allowedOriginsRaw);
config.cors.allowAnyOrigin = corsOrigins.includes('*') || (!isProduction && corsOrigins.length === 0);
config.cors.allowedOrigins = corsOrigins.filter((o) => o !== '*');

const s3CorsOrigins = parseCsv(process.env.S3_CORS_ORIGINS);
if (s3CorsOrigins.includes('*')) {
  config.s3.corsAllowedOrigins = ['*'];
} else if (s3CorsOrigins.length > 0) {
  config.s3.corsAllowedOrigins = s3CorsOrigins;
} else if (config.cors.allowAnyOrigin) {
  config.s3.corsAllowedOrigins = ['*'];
} else {
  config.s3.corsAllowedOrigins = config.cors.allowedOrigins;
}

// Fail-fast on missing critical secrets in production.
if (isProduction) {
  if (!config.jwtSecret) {
    throw new Error('Missing required env: JWT_SECRET');
  }
  if (!config.adminSecret) {
    throw new Error('Missing required env: MEW_ADMIN_SECRET');
  }
  // Ensure S3 creds are provided (env or credentials file).
  if (!config.s3.accessKeyId || !config.s3.secretAccessKey || config.s3.secretAccessKey === 'garage-secret') {
    throw new Error('Missing required S3 credentials (S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY or S3_CREDENTIALS_FILE)');
  }
}

export default config;
