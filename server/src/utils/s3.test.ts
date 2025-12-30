import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Upload } from '@aws-sdk/lib-storage';
import { nanoid } from 'nanoid';
import { uploadFile } from './s3';

// Mock dependencies
vi.mock('@aws-sdk/lib-storage');
vi.mock('nanoid');
vi.mock('../config', () => ({
  default: {
    staticUrl: '',
    s3: {
      endpoint: 'mock-s3.com',
      webEndpoint: 'mock-s3.com',
      port: 9000,
      webPort: 9000,
      accessKeyId: 'mock-key',
      secretAccessKey: 'mock-secret',
      bucketName: 'mock-bucket',
      useSsl: false,
    },
  },
}));

describe('S3 Upload Utility', () => {
  const mockFile: Express.Multer.File = {
    fieldname: 'test-file',
    originalname: 'image.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 12345,
    buffer: Buffer.from('mock file content'),
    stream: new (require('stream').Readable)(),
    destination: '',
    filename: '',
    path: '',
  };

  beforeEach(() => {
    vi.mocked(nanoid).mockReturnValue('random-string-123');

    vi.mocked(Upload).mockImplementation(
      function () {
        return {
          done: vi.fn().mockResolvedValue({}),
        };
      } as any
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call the Upload constructor with correct parameters', async () => {
    await uploadFile(mockFile);

    const expectedKey = 'random-string-123.png';

    expect(Upload).toHaveBeenCalledOnce();
    expect(Upload).toHaveBeenCalledWith({
      client: expect.any(Object),
      params: {
        Bucket: 'mock-bucket',
        Key: expectedKey,
        Body: mockFile.buffer,
        ContentType: mockFile.mimetype,
      },
    });
  });

  it('should return the key and metadata', async () => {
    const result = await uploadFile(mockFile);

    const expectedKey = 'random-string-123.png';

    expect(result).toEqual({
      key: expectedKey,
      mimetype: mockFile.mimetype,
      size: mockFile.size,
    });
  });

  it('should correctly handle files without an extension', async () => {
    const fileWithoutExt: Express.Multer.File = { ...mockFile, originalname: 'document' };
    const result = await uploadFile(fileWithoutExt);

    const expectedKey = 'random-string-123';

    expect(Upload).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({ Key: expectedKey })
    }));

    expect(result.key).toBe(expectedKey);
  });
});
