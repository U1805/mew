import api from './http';

export const ttsApi = {
  synthesize: (text: string) =>
    api.post<ArrayBuffer>('/tts', { text }, { responseType: 'arraybuffer' }),
};

export default ttsApi;

