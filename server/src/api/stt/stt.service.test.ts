import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as sttService from './stt.service';

type MockResponseShape = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

const asResponse = (payload: MockResponseShape) => payload as unknown as Response;

describe('stt.service', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses upstream upload + inference flow and returns json response', async () => {
    fetchMock
      .mockResolvedValueOnce(
        asResponse({
          ok: true,
          status: 200,
          json: async () => ['/tmp/gradio/abc/audio.wav'],
        })
      )
      .mockResolvedValueOnce(
        asResponse({
          ok: true,
          status: 200,
          json: async () => ({ event_id: 'evt-1' }),
        })
      )
      .mockResolvedValueOnce(
        asResponse({
          ok: true,
          status: 200,
          text: async () => 'event: complete\ndata: ["  hello world  ", "en"]\n\n',
        })
      );

    const file = {
      buffer: Buffer.from('audio-bytes'),
      mimetype: 'audio/webm',
      originalname: 'a.webm',
    } as Express.Multer.File;

    const result = await sttService.transcribeForOpenAiCompat(file, {
      model: 'qwen-qwen3-asr:itn',
      prompt: 'custom context',
    });

    expect(result).toEqual({ text: 'hello world' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://qwen-qwen3-asr-demo.ms.show/gradio_api/upload',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://qwen-qwen3-asr-demo.ms.show/gradio_api/call/asr_inference',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://qwen-qwen3-asr-demo.ms.show/gradio_api/call/asr_inference/evt-1',
      expect.objectContaining({ method: 'GET' })
    );

    const asrCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(asrCallBody.data[1]).toBe('custom context');
    expect(asrCallBody.data[3]).toBe(true);
  });

  it('returns text response when response_format=text', async () => {
    fetchMock
      .mockResolvedValueOnce(asResponse({ ok: true, status: 200, json: async () => ['/tmp/gradio/abc/audio.wav'] }))
      .mockResolvedValueOnce(asResponse({ ok: true, status: 200, json: async () => ({ event_id: 'evt-1' }) }))
      .mockResolvedValueOnce(asResponse({ ok: true, status: 200, text: async () => 'event: complete\ndata: ["hello", "zh"]\n\n' }));

    const file = {
      buffer: Buffer.from('audio-bytes'),
      mimetype: 'audio/webm',
      originalname: 'a.webm',
    } as Express.Multer.File;

    const result = await sttService.transcribeForOpenAiCompat(file, {
      model: 'qwen-qwen3-asr',
      responseFormat: 'text',
    });

    expect(result).toBe('hello');
  });

  it('returns verbose_json response shape using upstream language', async () => {
    fetchMock
      .mockResolvedValueOnce(asResponse({ ok: true, status: 200, json: async () => ['/tmp/gradio/abc/audio.wav'] }))
      .mockResolvedValueOnce(asResponse({ ok: true, status: 200, json: async () => ({ event_id: 'evt-1' }) }))
      .mockResolvedValueOnce(
        asResponse({ ok: true, status: 200, text: async () => 'event: complete\ndata: ["content", "en"]\n\n' })
      );

    const file = {
      buffer: Buffer.from('audio-bytes'),
      mimetype: 'audio/webm',
      originalname: 'a.webm',
    } as Express.Multer.File;

    const result = await sttService.transcribeForOpenAiCompat(file, {
      model: 'qwen-qwen3-asr',
      language: 'zh',
      responseFormat: 'verbose_json',
      temperature: 0.3,
    });

    expect(result).toMatchObject({
      task: 'transcribe',
      language: 'en',
      text: 'content',
      duration: 5,
      segments: [
        {
          id: 0,
          start: 0,
          end: 5,
          text: 'content',
          temperature: 0.3,
        },
      ],
      words: [],
    });
  });
});
