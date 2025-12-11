import multer from 'multer';
import { BadRequestError } from '../utils/errors';

const storage = multer.memoryStorage();

const fileFilter = (req: any, file: any, cb: any) => {
  // For now, let's accept all files. Specific validation can be added later.
  cb(null, true);
};

const limits = {
  fileSize: 1024 * 1024 * 8, // 8 MB limit
};

export const upload = multer({
  storage,
  fileFilter,
  limits,
});
