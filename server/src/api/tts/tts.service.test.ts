import { describe, it, expect, vi, afterEach } from 'vitest';
import { ttsService } from './tts.service';

type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  body?: { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } };
};

const mockFetch = (impl: (url: string, init?: RequestInit) => Promise<FetchResponse>) => {
  vi.stubGlobal('fetch', impl as unknown as typeof fetch);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('tts.service', () => {
  it('sends a POST request with expected headers/body and returns mp3 buffer', async () => {
    mockFetch(async (url, init) => {
      expect(url).toContain('https://bot.n.cn/api/tts/v1?roleid=test-voice');
      expect(init?.method).toBe('POST');

      const headers = init?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(headers['device-platform']).toBe('Web');
      expect(headers['zm-ver']).toBe('1.2');
      expect(headers['User-Agent']).toContain('Mozilla/5.0');
      expect(headers['timestamp']).toMatch(/\+08:00$/);
      expect(headers['access-token']).toHaveLength(32);
      expect(headers['zm-ua']).toMatch(/^[a-f0-9]{32}$/);
      expect(headers['zm-token']).toMatch(/^[a-f0-9]{32}$/);

      expect(init?.body).toBe('&text=hello%20world&audio_type=mp3&format=stream');

      const buf = new Uint8Array([1, 2, 3]).buffer;
      return {
        ok: true,
        status: 200,
        text: async () => '',
        arrayBuffer: async () => buf,
      };
    });

    const audio = await ttsService.synthesizeMp3('hello world', 'test-voice');
    expect(Buffer.isBuffer(audio)).toBe(true);
    expect([...audio]).toEqual([1, 2, 3]);
  });

  it('throws when upstream returns a non-2xx status', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    await expect(ttsService.synthesizeMp3('hi', 'doubao')).rejects.toThrow('TTS upstream error (502): bad gateway');
  });

  it('throws when upstream returns 2xx but non-audio content-type', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null),
      } as any,
      text: async () => '{"code":1100,"msg":"bad token"}',
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    await expect(ttsService.synthesizeMp3('hi', 'doubao')).rejects.toThrow(
      'TTS upstream non-audio response (application/json; charset=utf-8): {"code":1100,"msg":"bad token"}'
    );
  });

  it('throws when upstream returns empty audio', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    await expect(ttsService.synthesizeMp3('hi', 'doubao')).rejects.toThrow('TTS upstream returned empty audio');
  });

  it('streams chunked audio from upstream', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
      body: {
        getReader: () => {
          let i = 0;
          const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
          return {
            read: async () => {
              if (i >= chunks.length) return { done: true };
              const value = chunks[i++];
              return { done: false, value };
            },
          };
        },
      },
    }));

    const out: number[] = [];
    await ttsService.streamMp3('hi', 'doubao', (chunk) => {
      out.push(...chunk);
    });

    expect(out).toEqual([1, 2, 3]);
  });

  it('throws when streaming response body is missing', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    await expect(ttsService.streamMp3('hi', 'doubao', () => {})).rejects.toThrow('TTS upstream returned empty audio');
  });

  it('throws when streaming response has no audio chunks', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
      body: {
        getReader: () => ({
          read: async () => ({ done: true }),
        }),
      },
    }));

    await expect(ttsService.streamMp3('hi', 'doubao', () => {})).rejects.toThrow('TTS upstream returned empty audio');
  });

  it('streams chunks incrementally without waiting for all data', async () => {
    const waiters: Array<() => void> = [];
    let index = 0;
    const chunks = [new Uint8Array([10]), new Uint8Array([20]), new Uint8Array([30])];

    mockFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
      body: {
        getReader: () => ({
          read: async () => {
            if (index >= chunks.length) return { done: true };
            await new Promise<void>((resolve) => {
              waiters.push(resolve);
            });
            const value = chunks[index++];
            return { done: false, value };
          },
        }),
      },
    }));

    const seen: number[] = [];
    const run = ttsService.streamMp3('hi', 'doubao', (chunk) => {
      seen.push(...chunk);
    });

    const waitForPendingRead = async () => {
      for (let i = 0; i < 20; i += 1) {
        if (waiters.length > 0) return;
        await Promise.resolve();
      }
      throw new Error('reader did not request next chunk in time');
    };

    expect(seen).toEqual([]);
    await waitForPendingRead();
    waiters.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([10]);

    await waitForPendingRead();
    waiters.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([10, 20]);

    await waitForPendingRead();
    waiters.shift()?.();
    await run;
    expect(seen).toEqual([10, 20, 30]);
  });

  it('supports qwen3-tts model pipeline and downloads audio', async () => {
    mockFetch(async (url, init) => {
      if (url.endsWith('/gradio_api/info')) {
        return {
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({
            named_endpoints: {
              '/tts_interface': {
                parameters: [
                  {
                    parameter_name: 'voice_display',
                    type: { enum: ['Vivian / 十三'] },
                  },
                ],
              },
            },
          }),
          arrayBuffer: async () => new ArrayBuffer(0),
        } as unknown as FetchResponse;
      }

      if (url.endsWith('/gradio_api/call/tts_interface') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body.data[0]).toBe('hello qwen');
        expect(body.data[1]).toBe('Vivian / 十三');
        return {
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({ event_id: 'evt-1' }),
          arrayBuffer: async () => new ArrayBuffer(0),
        } as unknown as FetchResponse;
      }

      if (url.endsWith('/gradio_api/call/tts_interface/evt-1')) {
        return {
          ok: true,
          status: 200,
          text: async () => 'event: complete\ndata: [{"url":"https://qwen-qwen3-tts-demo.ms.show/file.wav"}]\n\n',
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }

      if (url === 'https://qwen-qwen3-tts-demo.ms.show/file.wav') {
        return {
          ok: true,
          status: 200,
          text: async () => '',
          headers: {
            get: (name: string) => (name.toLowerCase() === 'content-type' ? 'audio/wav' : null),
          } as any,
          arrayBuffer: async () => new Uint8Array([5, 6, 7]).buffer,
        } as unknown as FetchResponse;
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    const audio = await ttsService.synthesizeMp3('hello qwen', 'vivian', 'qwen3-tts');
    expect([...audio]).toEqual([5, 6, 7]);
  });
});

