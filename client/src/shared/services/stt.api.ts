import { API_URL } from './http';

type SttResponseFormat = 'json' | 'text' | 'srt' | 'vtt' | 'verbose_json';

type SttTranscribeOptions = {
  model?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  response_format?: SttResponseFormat;
};

type SttJsonResponse = {
  text?: string;
};

export const sttApi = {
  transcribe: async (file: File, options?: SttTranscribeOptions): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    form.append('model', options?.model || 'whisper-1');
    if (options?.language) form.append('language', options.language);
    if (options?.prompt) form.append('prompt', options.prompt);
    if (typeof options?.temperature === 'number') form.append('temperature', String(options.temperature));
    form.append('response_format', options?.response_format || 'json');

    const resp = await fetch(`${API_URL}/v1/audio/transcriptions`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`STT failed (${resp.status})${errText ? `: ${errText.slice(0, 200)}` : ''}`);
    }

    const responseFormat = options?.response_format || 'json';
    if (responseFormat === 'text') {
      return (await resp.text()).trim();
    }

    const data = (await resp.json()) as SttJsonResponse;
    return (typeof data?.text === 'string' ? data.text : '').trim();
  },
};

export default sttApi;

