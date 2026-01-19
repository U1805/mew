import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import Message from '../message/message.model';
import { BadRequestError, NotFoundError } from '../../utils/errors';

vi.mock('nanoid', () => ({
  nanoid: () => 'id123',
}));

vi.mock('../../config', () => ({
  default: {
    s3: {
      presignExpiresSeconds: 123,
    },
  },
}));

vi.mock('../../utils/s3', () => ({
  uploadFile: vi.fn(),
  createPresignedPutUrl: vi.fn(),
  getObjectStream: vi.fn(),
}));

import { uploadFileHandler, presignUploadHandler, downloadFileHandler } from './upload.controller';
import { uploadFile, createPresignedPutUrl, getObjectStream } from '../../utils/s3';

describe('api/upload/upload.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadFileHandler', () => {
    it('calls next with BadRequestError when no file is provided', async () => {
      const req: any = {};
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await uploadFileHandler(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
      expect(next.mock.calls[0][0].message).toBe('No file uploaded.');
    });

    it('uses uploadFile fallback when multer does not provide key', async () => {
      vi.mocked(uploadFile).mockResolvedValue({ key: 'k1.png', mimetype: 'image/png', size: 10 } as any);

      const req: any = {
        file: {
          originalname: 'test.png',
          mimetype: 'image/png',
          size: 10,
          buffer: Buffer.from('x'),
        },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await uploadFileHandler(req, res, next);

      expect(uploadFile).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        filename: 'test.png',
        contentType: 'image/png',
        key: 'k1.png',
        size: 10,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('does not call uploadFile when key already exists on req.file', async () => {
      const req: any = {
        file: {
          originalname: 'test.png',
          mimetype: 'image/png',
          size: 10,
          key: 'existing.png',
        },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await uploadFileHandler(req, res, next);

      expect(uploadFile).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        filename: 'test.png',
        contentType: 'image/png',
        key: 'existing.png',
        size: 10,
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('presignUploadHandler', () => {
    it('validates filename and size', async () => {
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await presignUploadHandler({ body: { filename: '', size: 1 } } as any, res, next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);

      next.mockClear();
      await presignUploadHandler({ body: { filename: 'a.txt', size: 0 } } as any, res, next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);

      next.mockClear();
      await presignUploadHandler({ body: { filename: 'a.txt', size: 1024 * 1024 * 51 } } as any, res, next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
    });

    it('returns a presigned upload response', async () => {
      vi.mocked(createPresignedPutUrl).mockResolvedValue('https://s3.example/put' as any);

      const req: any = { body: { filename: 'pic.png', contentType: ' image/png ', size: 12 } };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await presignUploadHandler(req, res, next);

      expect(createPresignedPutUrl).toHaveBeenCalledWith({ key: 'id123.png', contentType: 'image/png' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        key: 'id123.png',
        url: 'https://s3.example/put',
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        expiresInSeconds: 123,
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('downloadFileHandler', () => {
    it('validates required params', async () => {
      const res: any = {};
      const next = vi.fn();

      await downloadFileHandler({ params: { channelId: 'c1', key: '' } } as any, res, next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);

      next.mockClear();
      await downloadFileHandler({ params: { channelId: '', key: 'k1' } } as any, res, next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
    });

    it('returns NotFound when message/attachment is not allowed', async () => {
      const exists = vi.spyOn(Message, 'exists').mockResolvedValue(null as any);
      const res: any = {};
      const next = vi.fn();

      await downloadFileHandler({ params: { channelId: 'c1', key: 'k1' } } as any, res, next);

      expect(exists).toHaveBeenCalledWith({
        channelId: 'c1',
        retractedAt: null,
        $or: [{ 'attachments.key': 'k1' }, { 'payload.sticker.key': 'k1' }, { 'payload.voice.key': 'k1' }],
      });
      expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
    });

    it('pipes the S3 stream to the response when available', async () => {
      vi.spyOn(Message, 'exists').mockResolvedValue({ _id: 'm1' } as any);
      const body = new PassThrough();
      vi.spyOn(body, 'pipe');

      vi.mocked(getObjectStream).mockResolvedValue({
        body,
        contentType: 'text/plain',
        contentLength: 3,
      } as any);

      const resStream: any = new PassThrough();
      resStream.setHeader = vi.fn();
      resStream.headersSent = false;
      resStream.status = vi.fn().mockReturnThis();
      resStream.json = vi.fn();

      const next = vi.fn();

      await downloadFileHandler({ params: { channelId: 'c1', key: 'k1' } } as any, resStream, next);

      expect(getObjectStream).toHaveBeenCalledWith('k1');
      expect(resStream.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(resStream.setHeader).toHaveBeenCalledWith('Content-Length', '3');
      expect(resStream.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=3600');
      expect(resStream.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(resStream.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment');
      expect(body.pipe).toHaveBeenCalledWith(resStream);
      expect(next).not.toHaveBeenCalled();
    });

    it('allows sticker keys referenced in payload', async () => {
      vi.spyOn(Message, 'exists').mockResolvedValue({ _id: 'm1' } as any);
      const body = new PassThrough();
      vi.spyOn(body, 'pipe');

      vi.mocked(getObjectStream).mockResolvedValue({
        body,
        contentType: 'image/png',
        contentLength: 3,
      } as any);

      const resStream: any = new PassThrough();
      resStream.setHeader = vi.fn();
      resStream.headersSent = false;
      resStream.status = vi.fn().mockReturnThis();
      resStream.json = vi.fn();

      const next = vi.fn();

      await downloadFileHandler({ params: { channelId: 'c1', key: 'sticker.png' } } as any, resStream, next);

      expect(Message.exists).toHaveBeenCalledWith({
        channelId: 'c1',
        retractedAt: null,
        $or: [
          { 'attachments.key': 'sticker.png' },
          { 'payload.sticker.key': 'sticker.png' },
          { 'payload.voice.key': 'sticker.png' },
        ],
      });
      expect(getObjectStream).toHaveBeenCalledWith('sticker.png');
      expect(body.pipe).toHaveBeenCalledWith(resStream);
      expect(next).not.toHaveBeenCalled();
    });

    it('maps S3 NoSuchKey to NotFoundError', async () => {
      vi.spyOn(Message, 'exists').mockResolvedValue({ _id: 'm1' } as any);
      vi.mocked(getObjectStream).mockRejectedValue({ code: 'NoSuchKey' });

      const res: any = {};
      const next = vi.fn();

      await downloadFileHandler({ params: { channelId: 'c1', key: 'k1' } } as any, res, next);

      expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
    });
  });
});
