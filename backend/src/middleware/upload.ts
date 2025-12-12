import multer from 'multer';

const storage = multer.memoryStorage();

const limits = {
  fileSize: 1024 * 1024 * 8, // 8 MB limit
};

export const upload = multer({
  storage,
  limits,
});
