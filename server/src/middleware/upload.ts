import multer from 'multer';
import { BadRequestError } from '../utils/errors';
import { s3StreamingStorage } from './s3Storage';
import { MAX_UPLOAD_BYTES } from '../constants/upload';

const storage = s3StreamingStorage();

// --- General Attachment Configuration ---
const attachmentLimits = {
  fileSize: MAX_UPLOAD_BYTES,
};

export const uploadAttachment = multer({
  storage,
  limits: attachmentLimits,
});

// --- Transient Uploads (in-memory; used for STT, etc.) ---
const transientLimits = {
  fileSize: MAX_UPLOAD_BYTES,
};

export const uploadTransient = multer({
  storage: multer.memoryStorage(),
  limits: transientLimits,
});

// --- Image-specific Configuration (for Avatars, Icons) ---
const imageLimits = {
  fileSize: MAX_UPLOAD_BYTES,
};

const imageFileFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError('Invalid file type. Only common image formats are allowed.'), false);
  }
};

export const uploadImage = multer({
  storage,
  limits: imageLimits,
  fileFilter: imageFileFilter,
});
