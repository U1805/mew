export type OpenAiSttResponseFormat = 'json' | 'text' | 'srt' | 'vtt' | 'verbose_json';

export type OpenAiSttOptions = {
  model: string;
  language?: string;
  prompt?: string;
  responseFormat?: OpenAiSttResponseFormat;
  temperature?: number;
};

export async function transcribeVoiceFileToText(_file: Express.Multer.File): Promise<string> {
  // NOTE: We don't have an STT provider key yet.
  // Hard-coded placeholder per product requirement.
  return '语音转文字结果为空';
}

const formatSecondsForSrt = (seconds: number) => {
  const ms = Math.max(0, Math.floor(seconds * 1000));
  const hh = Math.floor(ms / 3_600_000)
    .toString()
    .padStart(2, '0');
  const mm = Math.floor((ms % 3_600_000) / 60_000)
    .toString()
    .padStart(2, '0');
  const ss = Math.floor((ms % 60_000) / 1000)
    .toString()
    .padStart(2, '0');
  const mmm = (ms % 1000).toString().padStart(3, '0');
  return `${hh}:${mm}:${ss},${mmm}`;
};

const formatSecondsForVtt = (seconds: number) => formatSecondsForSrt(seconds).replace(',', '.');

export async function transcribeForOpenAiCompat(file: Express.Multer.File, options: OpenAiSttOptions) {
  const text = await transcribeVoiceFileToText(file);
  const responseFormat = options.responseFormat ?? 'json';
  const normalizedText = typeof text === 'string' ? text.trim() : '';

  if (responseFormat === 'text') {
    return normalizedText;
  }

  if (responseFormat === 'srt') {
    return `1\n${formatSecondsForSrt(0)} --> ${formatSecondsForSrt(5)}\n${normalizedText}\n`;
  }

  if (responseFormat === 'vtt') {
    return `WEBVTT\n\n${formatSecondsForVtt(0)} --> ${formatSecondsForVtt(5)}\n${normalizedText}\n`;
  }

  if (responseFormat === 'verbose_json') {
    return {
      task: 'transcribe',
      language: options.language || 'zh',
      duration: 5,
      text: normalizedText,
      segments: [
        {
          id: 0,
          seek: 0,
          start: 0,
          end: 5,
          text: normalizedText,
          tokens: [],
          temperature: options.temperature ?? 0,
          avg_logprob: 0,
          compression_ratio: 0,
          no_speech_prob: 0,
        },
      ],
      words: [],
    };
  }

  return { text: normalizedText };
}

