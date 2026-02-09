import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { BadRequestError } from '../../utils/errors';

vi.mock('./stt.service', () => ({
  transcribeForOpenAiCompat: vi.fn(),
}));

import { createTranscription } from './stt.controller';
import { transcribeForOpenAiCompat } from './stt.service';

const createRes = () => {
  const res: any = {};
  res.status = vi.fn().mockImplementation(() => res);
  res.type = vi.fn().mockImplementation(() => res);
  res.send = vi.fn();
  res.json = vi.fn();
  return res as Response & {
    status: ReturnType<typeof vi.fn>;
    type: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
};

describe('stt.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing file', async () => {
    const req = { body: { model: 'whisper-1' } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await createTranscription(req, res, next);

    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.message).toBe('file is required');
  });

  it('rejects missing model', async () => {
    const req = { body: {}, file: {} } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await createTranscription(req, res, next);

    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.message).toBe('model is required');
  });

  it('returns json payload by default', async () => {
    const req = { body: { model: 'whisper-1' }, file: { originalname: 'a.webm' } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    (transcribeForOpenAiCompat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ text: 'hello' });

    await createTranscription(req, res, next);

    expect(transcribeForOpenAiCompat).toHaveBeenCalledWith(req.file, {
      model: 'whisper-1',
      language: undefined,
      prompt: undefined,
      responseFormat: 'json',
      temperature: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ text: 'hello' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns text/plain for response_format=text', async () => {
    const req = {
      body: { model: 'whisper-1', response_format: 'text' },
      file: { originalname: 'a.webm' },
    } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    (transcribeForOpenAiCompat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('hello plain');

    await createTranscription(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('text/plain');
    expect(res.send).toHaveBeenCalledWith('hello plain');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid response_format', async () => {
    const req = {
      body: { model: 'whisper-1', response_format: 'xml' },
      file: { originalname: 'a.webm' },
    } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await createTranscription(req, res, next);

    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.message).toBe('response_format is invalid');
  });
});

