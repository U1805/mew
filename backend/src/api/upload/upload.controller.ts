import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import { uploadFile } from '../../utils/s3';
import { BadRequestError } from '../../utils/errors';

export const uploadFileHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new BadRequestError('No file uploaded.');
  }

  const result = await uploadFile(req.file);

  const attachment = {
    filename: req.file.originalname, // The original filename from the user's machine
    contentType: result.mimetype,
    key: result.key, // [修正] 返回 key 而不是 url
    size: result.size,
  };

  res.status(201).json(attachment);
});
