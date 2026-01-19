import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import Message from '../message/message.model';
import { nanoid } from 'nanoid';
import { MAX_UPLOAD_BYTES } from '../../constants/upload';

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

export const presignUploadHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = (req.body || {}) as any;
  const originalname = typeof body.filename === 'string' ? body.filename : '';
  const contentType = typeof body.contentType === 'string' ? body.contentType : '';
  const size = typeof body.size === 'number' ? body.size : Number.parseInt(String(body.size || ''), 10);

  if (!originalname.trim()) {
    throw new BadRequestError('filename is required');
  }
  if (Number.isNaN(size) || size <= 0) {
    throw new BadRequestError('size is required');
  }
  if (size > MAX_UPLOAD_BYTES) {
    throw new BadRequestError('file is too large');
  }

  const ext = originalname.includes('.') ? `.${originalname.split('.').pop()}` : '';
  const key = `${nanoid()}${ext}`;

  const { createPresignedPutUrl } = await import('../../utils/s3');
  const { default: config } = await import('../../config');
  const url = await createPresignedPutUrl({ key, contentType: contentType.trim() || undefined });

  res.status(200).json({
    key,
    url,
    method: 'PUT',
    headers: {
      ...(contentType.trim() ? { 'Content-Type': contentType.trim() } : {}),
    },
    expiresInSeconds: config.s3.presignExpiresSeconds,
  });
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

  const trimmedKey = key.trim();
  const allowed = await Message.exists({
    channelId,
    retractedAt: null,
    $or: [
      { 'attachments.key': trimmedKey },
      // Allow bot-friendly downloads for sticker assets referenced by messages in the channel.
      // This is important when the public S3/static domain is not reachable from bot containers.
      { 'payload.sticker.key': trimmedKey },
      // Allow bot-friendly downloads for voice message audio referenced by messages in the channel.
      { 'payload.voice.key': trimmedKey },
    ],
  });
  if (!allowed) {
    throw new NotFoundError('File not found.');
  }

  try {
    const { getObjectStream } = await import('../../utils/s3');
    const obj = await getObjectStream(trimmedKey);

    if (!obj?.body) {
      throw new NotFoundError('File not found.');
    }

    if (obj.contentType) res.setHeader('Content-Type', obj.contentType);
    if (typeof obj.contentLength === 'number') res.setHeader('Content-Length', String(obj.contentLength));

    // Private: user must be authenticated/authorized to reach this route.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');

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
