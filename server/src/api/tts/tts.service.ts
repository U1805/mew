import { fetchNamiaiUpstream } from './tts.namiai.upstream';
import { fetchQwen3Upstream } from './tts.qwen3.upstream';

export type TtsModel = 'namiai' | 'qwen3-tts';

const DEFAULT_TTS_MODEL: TtsModel = 'namiai';

const fetchByModel = async (text: string, voice: string, model: string) => {
  if (model === 'qwen3-tts') {
    return fetchQwen3Upstream(text, voice);
  }
  return fetchNamiaiUpstream(text, voice);
};

export const ttsService = {
  async fetchUpstream(text: string, voice: string, model: string = DEFAULT_TTS_MODEL) {
    return fetchByModel(text, voice, model);
  },

  async synthesizeMp3(text: string, voice: string, model: string = DEFAULT_TTS_MODEL) {
    const res = await this.fetchUpstream(text, voice, model);

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) {
      throw new Error('TTS upstream returned empty audio');
    }
    return buf;
  },

  async streamMp3(text: string, voice: string, onChunk: (chunk: Buffer) => void, model: string = DEFAULT_TTS_MODEL) {
    const res = await this.fetchUpstream(text, voice, model);
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('TTS upstream returned empty audio');
    }

    let hasData = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const buf = Buffer.from(value);
      if (!buf.length) continue;
      hasData = true;
      onChunk(buf);
    }

    if (!hasData) {
      throw new Error('TTS upstream returned empty audio');
    }
  },
};

