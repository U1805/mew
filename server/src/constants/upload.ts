const DEFAULT_LIMIT_MB = 50;

const parseLimitMb = (raw: string | undefined): number => {
  const parsed = Number.parseFloat(String(raw ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT_MB;
  return parsed;
};

// Upload size limit in MB (env: LIMIT_FILE_SIZE).
export const MAX_UPLOAD_MB = parseLimitMb(process.env.LIMIT_FILE_SIZE);
export const MAX_UPLOAD_BYTES = Math.floor(MAX_UPLOAD_MB * 1024 * 1024);

