import multer from 'multer';
import { BadRequestError } from '../utils/errors';

const storage = multer.memoryStorage();

// --- General Attachment Configuration ---
const attachmentLimits = {
  fileSize: 1024 * 1024 * 8, // 8 MB limit for general files
};

export const uploadAttachment = multer({
  storage,
  limits: attachmentLimits,
});

// --- Image-specific Configuration (for Avatars, Icons) ---
const imageLimits = {
  fileSize: 1024 * 1024 * 2, // 2 MB limit for images
};

const imageFileFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError('Invalid file type. Only JPG, PNG, and GIF are allowed.'), false);
  }
};

export const uploadImage = multer({
  storage,
  limits: imageLimits,
  fileFilter: imageFileFilter,
});
