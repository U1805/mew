import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import Message from '../message/message.model';

export const uploadFileHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new BadRequestError('No file uploaded.');
  }

  const uploaded: any = req.file as any;
  // In production, uploads are streamed to S3 by Multer storage; keep a fallback for tests/legacy paths.
  if (!uploaded.key) {
    const { uploadFile } = await import('../../utils/s3');
    Object.assign(uploaded, await uploadFile(req.file));
  }

  const attachment = {
    filename: req.file.originalname, // The original filename from the user's machine
    contentType: uploaded.mimetype,
    key: uploaded.key, // [修正] 返回 key 而不是 url
    size: uploaded.size,
  };

  res.status(201).json(attachment);
});

export const downloadFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params as any;
  const key = (req.params as any).key as string;
  if (!key || !key.trim()) {
    throw new BadRequestError('Attachment key is required.');
  }
  if (!channelId || !String(channelId).trim()) {
    throw new BadRequestError('Channel ID is required.');
  }

  const allowed = await Message.exists({ channelId, 'attachments.key': key.trim() });
  if (!allowed) {
    throw new NotFoundError('File not found.');
  }

  try {
    const { getObjectStream } = await import('../../utils/s3');
    const obj = await getObjectStream(key.trim());

    if (!obj?.body) {
      throw new NotFoundError('File not found.');
    }

    if (obj.contentType) res.setHeader('Content-Type', obj.contentType);
    if (typeof obj.contentLength === 'number') res.setHeader('Content-Length', String(obj.contentLength));

    // Private: user must be authenticated/authorized to reach this route.
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const body: any = obj.body as any;
    if (typeof body.pipe === 'function') {
      body.on('error', () => {
        if (!res.headersSent) res.status(500);
        res.end();
      });
      body.pipe(res);
      return;
    }

    // Fallback for non-stream bodies (unlikely in Node).
    res.status(500).json({ message: 'Unexpected S3 response body.' });
  } catch (err: any) {
    const name = String(err?.name || '');
    const code = String(err?.Code || err?.code || '');
    if (name === 'NoSuchKey' || code === 'NoSuchKey' || code === 'NotFound') {
      throw new NotFoundError('File not found.');
    }
    throw err;
  }
});
