import { API_URL } from './http';

type TtsStreamOptions = {
  voice?: string;
  onChunk?: (chunk: Uint8Array) => void;
};

type TtsSynthesizeResult = {
  data: ArrayBuffer;
  contentType: string;
};

const collectStreamToArrayBuffer = async (
  stream: ReadableStream<Uint8Array>,
  onChunk?: (chunk: Uint8Array) => void
) => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.length === 0) continue;
    const chunk = value.slice();
    chunks.push(chunk);
    total += chunk.length;
    onChunk?.(chunk);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged.buffer;
};

export const ttsApi = {
  synthesize: async (text: string, options?: TtsStreamOptions): Promise<TtsSynthesizeResult> => {
    const resp = await fetch(`${API_URL}/v1/audio/speech`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'namiai',
        input: text,
        voice: options?.voice || 'doubao',
        response_format: 'mp3',
        stream: true,
        stream_format: 'audio',
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`TTS failed (${resp.status})${errText ? `: ${errText.slice(0, 200)}` : ''}`);
    }

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('audio/')) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`TTS invalid content-type (${contentType || 'unknown'})${errText ? `: ${errText.slice(0, 200)}` : ''}`);
    }

    if (!resp.body) {
      throw new Error('TTS empty response body');
    }

    const data = await collectStreamToArrayBuffer(resp.body as ReadableStream<Uint8Array>, options?.onChunk);
    if (data.byteLength === 0) {
      throw new Error('TTS empty audio payload');
    }
    return { data, contentType };
  },
};

export default ttsApi;

