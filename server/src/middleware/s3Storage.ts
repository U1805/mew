import type { StorageEngine } from 'multer';
import { uploadStream } from '../utils/s3';

/**
 * Multer storage engine that streams uploads directly to S3 (no buffering in RAM / disk).
 * It stores the resulting S3 object key on `req.file.key`.
 */
export class S3StreamingStorage implements StorageEngine {
  async _handleFile(req: any, file: any, cb: (error?: any, info?: Partial<any>) => void) {
    try {
      const result = await uploadStream({
        stream: file.stream,
        originalname: file.originalname,
        mimetype: file.mimetype,
      });
      cb(null, result);
    } catch (error) {
      cb(error);
    }
  }

  // Best-effort cleanup when Multer asks to remove a file (e.g. aborted request).
  // Currently a no-op; implement delete if/when needed.
  _removeFile(req: any, file: any, cb: (error: Error | null) => void) {
    cb(null);
  }
}

export const s3StreamingStorage = () => new S3StreamingStorage();

