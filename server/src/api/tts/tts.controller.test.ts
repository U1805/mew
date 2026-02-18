import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { BadRequestError } from '../../utils/errors';

vi.mock('./tts.service', () => ({
  ttsService: {
    synthesizeMp3: vi.fn(),
    streamMp3: vi.fn(),
  },
}));

import { synthesizeTts } from './tts.controller';
import { ttsService } from './tts.service';

const createRes = () => {
  const res: any = {};
  res.setHeader = vi.fn();
  res.status = vi.fn().mockImplementation(() => res);
  res.send = vi.fn();
  res.write = vi.fn();
  res.end = vi.fn();
  return res as Response & {
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tts.controller', () => {
  it('rejects missing input/text', async () => {
    const req = { body: {} } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await synthesizeTts(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it('rejects too long text', async () => {
    const req = { body: { text: 'a'.repeat(12001) } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await synthesizeTts(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it('splits long text into multiple upstream calls and concatenates', async () => {
    const req = { body: { text: `${'a'.repeat(1790)}。${'b'.repeat(1790)}。` } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    (ttsService.synthesizeMp3 as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(Buffer.from([1, 2]))
      .mockResolvedValueOnce(Buffer.from([3, 4]));

    await synthesizeTts(req, res, next);

    expect(ttsService.synthesizeMp3).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(Buffer.from([1, 2, 3, 4]));
    expect(next).not.toHaveBeenCalled();
  });

  it('hard-splits when there are no delimiters', async () => {
    const req = { body: { text: 'a'.repeat(1805) } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    (ttsService.synthesizeMp3 as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(Buffer.from([1]))
      .mockResolvedValueOnce(Buffer.from([2]));

    await synthesizeTts(req, res, next);

    expect(ttsService.synthesizeMp3).toHaveBeenCalledTimes(2);
    expect(res.send).toHaveBeenCalledWith(Buffer.from([1, 2]));
    expect(next).not.toHaveBeenCalled();
  });

  it('appends a token into the current chunk when it fits', async () => {
    const req = { body: { text: `${'a'.repeat(1699)}。${'b'.repeat(50)}。${'c'.repeat(100)}` } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    (ttsService.synthesizeMp3 as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(Buffer.from([1]))
      .mockResolvedValueOnce(Buffer.from([2]));

    await synthesizeTts(req, res, next);

    expect(ttsService.synthesizeMp3).toHaveBeenCalledTimes(2);
    expect(ttsService.synthesizeMp3).toHaveBeenNthCalledWith(1, `${'a'.repeat(1699)}。${'b'.repeat(50)}。`, 'doubao', 'namiai');
    expect(ttsService.synthesizeMp3).toHaveBeenNthCalledWith(2, 'c'.repeat(100), 'doubao', 'namiai');
    expect(res.send).toHaveBeenCalledWith(Buffer.from([1, 2]));
    expect(next).not.toHaveBeenCalled();
  });

  it('flushes to a new chunk when appending would exceed the limit', async () => {
    const req = { body: { text: `${'a'.repeat(1790)}\n${'b'.repeat(30)}` } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    (ttsService.synthesizeMp3 as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(Buffer.from([1]))
      .mockResolvedValueOnce(Buffer.from([2]));

    await synthesizeTts(req, res, next);

    expect(ttsService.synthesizeMp3).toHaveBeenCalledTimes(2);
    expect(res.send).toHaveBeenCalledWith(Buffer.from([1, 2]));
    expect(next).not.toHaveBeenCalled();
  });

  it('synthesizes trimmed text and returns audio/mpeg', async () => {
    const req = { body: { text: '  hello  ' } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    const audio = Buffer.from([9, 8, 7]);
    (ttsService.synthesizeMp3 as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(audio);

    await synthesizeTts(req, res, next);

    expect(ttsService.synthesizeMp3).toHaveBeenCalledWith('hello', 'doubao', 'namiai');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(audio);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts OpenAI-compatible input/voice fields', async () => {
    const req = { body: { input: '  hello openai  ', voice: 'nova', model: 'namiai' } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    const audio = Buffer.from([7, 7, 7]);
    (ttsService.synthesizeMp3 as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(audio);

    await synthesizeTts(req, res, next);

    expect(ttsService.synthesizeMp3).toHaveBeenCalledWith('hello openai', 'nova', 'namiai');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(audio);
    expect(next).not.toHaveBeenCalled();
  });

  it('supports stream=true with audio stream output', async () => {
    const req = { body: { input: 'hello', stream: true } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    (ttsService.streamMp3 as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_text: string, _voice: string, onChunk: (chunk: Buffer) => void) => {
        onChunk(Buffer.from([1, 2]));
      }
    );

    await synthesizeTts(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
    expect(res.write).toHaveBeenCalledWith(Buffer.from([1, 2]));
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('supports stream=true with stream_format=sse output', async () => {
    const req = { body: { input: 'hello', stream: true, stream_format: 'sse' } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    (ttsService.streamMp3 as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_text: string, _voice: string, onChunk: (chunk: Buffer) => void) => {
        onChunk(Buffer.from([9]));
      }
    );

    await synthesizeTts(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
    const writes = (res.write as ReturnType<typeof vi.fn>).mock.calls.map((args) => String(args[0]));
    expect(writes.some((line) => line.includes('speech.audio.delta'))).toBe(true);
    expect(writes.some((line) => line.includes('speech.audio.done'))).toBe(true);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes qwen3-tts model to upstream service', async () => {
    const req = { body: { input: 'hello qwen', voice: 'vivian', model: 'qwen3-tts' } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    const audio = Buffer.from([6, 6]);
    (ttsService.synthesizeMp3 as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(audio);

    await synthesizeTts(req, res, next);

    expect(ttsService.synthesizeMp3).toHaveBeenCalledWith('hello qwen', 'vivian', 'qwen3-tts');
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

  it('maps TTS upstream errors to BadRequestError for readable client response', async () => {
    const req = { body: { text: 'hello' } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    const err = new Error('TTS upstream non-audio response (application/json): {"code":1100}');
    (ttsService.synthesizeMp3 as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(err);

    await synthesizeTts(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const passed = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passed).toBeInstanceOf(BadRequestError);
    expect((passed as Error).message).toContain('TTS upstream non-audio response');
  });
});

