import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';

vi.mock('../utils/s3', () => ({
  uploadStream: vi.fn(),
}));

describe('middleware/s3Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('_handleFile streams to S3 and returns result via callback', async () => {
    const { uploadStream } = await import('../utils/s3');
    vi.mocked(uploadStream).mockResolvedValue({ key: 'k', mimetype: 'image/png', size: 12 } as any);

    const { S3StreamingStorage } = await import('./s3Storage');
    const storage = new S3StreamingStorage();

    const cb = vi.fn();
    await storage._handleFile(
      {} as Request,
      { stream: {}, originalname: 'a.png', mimetype: 'image/png' },
      cb
    );

    expect(uploadStream).toHaveBeenCalledWith({
      stream: expect.anything(),
      originalname: 'a.png',
      mimetype: 'image/png',
    });
    expect(cb).toHaveBeenCalledWith(null, { key: 'k', mimetype: 'image/png', size: 12 });
  });

  it('_handleFile returns error via callback when upload fails', async () => {
    const { uploadStream } = await import('../utils/s3');
    vi.mocked(uploadStream).mockRejectedValue(new Error('boom'));

    const { S3StreamingStorage } = await import('./s3Storage');
    const storage = new S3StreamingStorage();
    const cb = vi.fn();

    await storage._handleFile(
      {} as Request,
      { stream: {}, originalname: 'a.png', mimetype: 'image/png' },
      cb
    );

    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });

  it('_removeFile is a no-op and always succeeds', async () => {
    const { S3StreamingStorage } = await import('./s3Storage');
    const storage = new S3StreamingStorage();
    const cb = vi.fn();
    storage._removeFile({} as Request, {} as any, cb);
    expect(cb).toHaveBeenCalledWith(null);
  });

  it('s3StreamingStorage returns a new instance', async () => {
    const { s3StreamingStorage, S3StreamingStorage } = await import('./s3Storage');
    expect(s3StreamingStorage()).toBeInstanceOf(S3StreamingStorage);
  });
});

