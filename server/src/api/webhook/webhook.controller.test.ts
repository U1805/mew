import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '../../utils/errors';

vi.mock('./webhook.service', () => ({
  getWebhooksByChannel: vi.fn(),
  createWebhook: vi.fn(),
  getWebhookTokenByChannel: vi.fn(),
  updateWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  resetWebhookToken: vi.fn(),
  executeWebhook: vi.fn(),
  assertValidWebhookToken: vi.fn(),
}));

vi.mock('../../utils/s3', () => ({
  uploadFile: vi.fn(),
  createPresignedPutUrl: vi.fn(),
}));

vi.mock('../../config', () => ({
  default: {
    s3: { presignExpiresSeconds: 600 },
  },
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'fixedid'),
}));

import * as WebhookService from './webhook.service';
import { createPresignedPutUrl, uploadFile } from '../../utils/s3';
import {
  createWebhook,
  deleteWebhook,
  executeWebhook,
  getWebhookToken,
  getWebhooks,
  presignWebhookFile,
  resetWebhookToken,
  updateWebhook,
  uploadWebhookFile,
} from './webhook.controller';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('webhook.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getWebhooks returns channel webhooks', async () => {
    vi.mocked(WebhookService.getWebhooksByChannel).mockResolvedValue([{ _id: 'w1' }] as any);
    const req: any = { params: { channelId: 'c1' } };
    const res = makeRes();
    const next = vi.fn();

    await getWebhooks(req, res, next);
    expect(WebhookService.getWebhooksByChannel).toHaveBeenCalledWith('c1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('createWebhook delegates create and returns 201', async () => {
    vi.mocked(WebhookService.createWebhook).mockResolvedValue({ _id: 'w1' } as any);
    const req: any = { params: { channelId: 'c1', serverId: 's1' }, body: { name: 'hook' }, file: { key: 'a.png' } };
    const res = makeRes();
    const next = vi.fn();

    await createWebhook(req, res, next);
    expect(WebhookService.createWebhook).toHaveBeenCalledWith('c1', 's1', { name: 'hook' }, req.file);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('getWebhookToken returns token payload', async () => {
    vi.mocked(WebhookService.getWebhookTokenByChannel).mockResolvedValue({ webhookId: 'w1', token: 't1' } as any);
    const req: any = { params: { channelId: 'c1', webhookId: 'w1' } };
    const res = makeRes();
    const next = vi.fn();

    await getWebhookToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateWebhook delegates update and returns 200', async () => {
    vi.mocked(WebhookService.updateWebhook).mockResolvedValue({ _id: 'w1' } as any);
    const req: any = { params: { webhookId: 'w1' }, body: { name: 'x' }, file: { key: 'a.png' } };
    const res = makeRes();
    const next = vi.fn();

    await updateWebhook(req, res, next);
    expect(WebhookService.updateWebhook).toHaveBeenCalledWith('w1', { name: 'x' }, req.file);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteWebhook delegates delete and returns 204', async () => {
    const req: any = { params: { webhookId: 'w1' } };
    const res = makeRes();
    const next = vi.fn();

    await deleteWebhook(req, res, next);
    expect(WebhookService.deleteWebhook).toHaveBeenCalledWith('w1');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('resetWebhookToken delegates reset and returns 200', async () => {
    vi.mocked(WebhookService.resetWebhookToken).mockResolvedValue({ webhookId: 'w1', token: 't2' } as any);
    const req: any = { params: { webhookId: 'w1' } };
    const res = makeRes();
    const next = vi.fn();

    await resetWebhookToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('executeWebhook delegates execute and returns 200', async () => {
    vi.mocked(WebhookService.executeWebhook).mockResolvedValue({ _id: 'm1' } as any);
    const req: any = { params: { webhookId: 'w1', token: 't1' }, body: { content: 'x' } };
    const res = makeRes();
    const next = vi.fn();

    await executeWebhook(req, res, next);
    expect(WebhookService.executeWebhook).toHaveBeenCalledWith('w1', 't1', { content: 'x' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uploadWebhookFile validates token and requires file', async () => {
    const req: any = { params: { webhookId: 'w1', token: 't1' } };
    const res = makeRes();
    const next = vi.fn();

    await uploadWebhookFile(req, res, next);
    expect(WebhookService.assertValidWebhookToken).toHaveBeenCalledWith('w1', 't1');
    expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
  });

  it('uploadWebhookFile uses existing key without calling uploadFile', async () => {
    const req: any = {
      params: { webhookId: 'w1', token: 't1' },
      file: { originalname: 'a.png', mimetype: 'image/png', size: 10, key: 'k1' },
    };
    const res = makeRes();
    const next = vi.fn();

    await uploadWebhookFile(req, res, next);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ filename: 'a.png', contentType: 'image/png', key: 'k1', size: 10 });
  });

  it('uploadWebhookFile uploads file when key is missing', async () => {
    vi.mocked(uploadFile as any).mockResolvedValue({ key: 'k2', mimetype: 'image/png', size: 11 });
    const req: any = {
      params: { webhookId: 'w1', token: 't1' },
      file: { originalname: 'a.png', mimetype: 'image/png', size: 10 },
    };
    const res = makeRes();
    const next = vi.fn();

    await uploadWebhookFile(req, res, next);
    expect(uploadFile).toHaveBeenCalledWith(req.file);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ filename: 'a.png', contentType: 'image/png', key: 'k2', size: 11 });
  });

  it('presignWebhookFile validates input fields', async () => {
    const res = makeRes();

    const next1 = vi.fn();
    await presignWebhookFile({ params: { webhookId: 'w1', token: 't1' }, body: {} } as any, res, next1);
    expect(next1.mock.calls[0][0]).toBeInstanceOf(BadRequestError);

    const next2 = vi.fn();
    await presignWebhookFile({ params: { webhookId: 'w1', token: 't1' }, body: { filename: 'a.png', size: 0 } } as any, res, next2);
    expect(next2.mock.calls[0][0]).toBeInstanceOf(BadRequestError);

    const next3 = vi.fn();
    await presignWebhookFile({ params: { webhookId: 'w1', token: 't1' }, body: { filename: 'a.png', size: 9999999999 } } as any, res, next3);
    expect(next3.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
  });

  it('presignWebhookFile creates presigned payload with optional content-type header', async () => {
    vi.mocked(createPresignedPutUrl as any).mockResolvedValue('https://put.url');
    const req: any = {
      params: { webhookId: 'w1', token: 't1' },
      body: { filename: 'audio.webm', size: '123', contentType: ' audio/webm ' },
    };
    const res = makeRes();
    const next = vi.fn();

    await presignWebhookFile(req, res, next);

    expect(createPresignedPutUrl).toHaveBeenCalledWith({ key: 'fixedid.webm', contentType: 'audio/webm' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'fixedid.webm',
        url: 'https://put.url',
        headers: { 'Content-Type': 'audio/webm' },
        expiresInSeconds: 600,
      })
    );
  });
});
