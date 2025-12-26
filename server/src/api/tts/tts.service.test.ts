import { describe, it, expect, vi, afterEach } from 'vitest';
import { ttsService } from './tts.service';

type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
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

  it('throws when upstream returns empty audio', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    await expect(ttsService.synthesizeMp3('hi', 'doubao')).rejects.toThrow('TTS upstream returned empty audio');
  });
});

