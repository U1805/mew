import { describe, it, expect, vi, afterEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { BadRequestError } from '../../utils/errors';

vi.mock('./tts.service', () => ({
  ttsService: {
    synthesizeMp3: vi.fn(),
  },
}));

import { synthesizeTts } from './tts.controller';
import { ttsService } from './tts.service';

const createRes = () => {
  const res: any = {};
  res.setHeader = vi.fn();
  res.status = vi.fn().mockImplementation(() => res);
  res.send = vi.fn();
  return res as Response & { setHeader: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tts.controller', () => {
  it('rejects missing text', async () => {
    const req = { body: {} } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await synthesizeTts(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it('rejects too long text', async () => {
    const req = { body: { text: 'a'.repeat(2001) } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await synthesizeTts(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it('synthesizes trimmed text and returns audio/mpeg', async () => {
    const req = { body: { text: '  hello  ' } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    const audio = Buffer.from([9, 8, 7]);
    (ttsService.synthesizeMp3 as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(audio);

    await synthesizeTts(req, res, next);

    expect(ttsService.synthesizeMp3).toHaveBeenCalledWith('hello', 'doubao');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(audio);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes upstream errors to next', async () => {
    const req = { body: { text: 'hello' } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    const err = new Error('boom');
    (ttsService.synthesizeMp3 as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(err);

    await synthesizeTts(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
