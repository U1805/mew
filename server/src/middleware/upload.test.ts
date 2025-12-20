import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../utils/errorHandler';

vi.mock('../utils/s3', () => ({
  uploadStream: vi.fn(),
}));

import { uploadStream } from '../utils/s3';
import { uploadAttachment, uploadImage } from './upload';

const makeApp = (middleware: any, field: string) => {
  const app = express();
  app.post('/upload', middleware.single(field), (req, res) => {
    res.status(200).json({ ok: true, mimetype: (req as any).file?.mimetype });
  });
  app.use(errorHandler);
  return app;
};

describe('middleware/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadStream).mockImplementation(async (opts: any) => {
      await new Promise<void>((resolve, reject) => {
        opts.stream.on('data', () => {});
        opts.stream.on('end', () => resolve());
        opts.stream.on('error', reject);
      });
      return { key: 'mock-key', mimetype: opts.mimetype, size: 3 } as any;
    });
  });

  it('uploadImage accepts allowed image mimetypes', async () => {
    const app = makeApp(uploadImage, 'avatar');
    const res = await request(app).post('/upload').attach('avatar', Buffer.from('img'), {
      filename: 'a.png',
      contentType: 'image/png',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mimetype).toBe('image/png');
  });

  it('uploadImage rejects disallowed mimetypes with 400', async () => {
    const app = makeApp(uploadImage, 'avatar');
    const res = await request(app).post('/upload').attach('avatar', Buffer.from('txt'), {
      filename: 'a.txt',
      contentType: 'text/plain',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Invalid file type');
  });

  it('uploadAttachment allows non-image files', async () => {
    const app = makeApp(uploadAttachment, 'file');
    const res = await request(app).post('/upload').attach('file', Buffer.from('hello'), {
      filename: 'note.txt',
      contentType: 'text/plain',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

