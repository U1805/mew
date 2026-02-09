import { describe, it, expect, vi } from 'vitest';
import * as sttService from './stt.service';

describe('stt.service', () => {
  it('returns json response by default', async () => {
    const result = await sttService.transcribeForOpenAiCompat({} as any, { model: 'whisper-1' });

    expect(result).toEqual({ text: '语音转文字结果为空' });
  });

  it('returns text response when response_format=text', async () => {
    const result = await sttService.transcribeForOpenAiCompat({} as any, { model: 'whisper-1', responseFormat: 'text' });

    expect(result).toBe('语音转文字结果为空');
  });

  it('returns verbose_json response shape', async () => {
    const result = await sttService.transcribeForOpenAiCompat({} as any, {
      model: 'whisper-1',
      language: 'en',
      responseFormat: 'verbose_json',
      temperature: 0.3,
    });

    expect(result).toMatchObject({
      task: 'transcribe',
      language: 'en',
      text: '语音转文字结果为空',
      duration: 5,
      segments: [
        {
          id: 0,
          start: 0,
          end: 5,
          text: '语音转文字结果为空',
          temperature: 0.3,
        },
      ],
      words: [],
    });
  });
});
