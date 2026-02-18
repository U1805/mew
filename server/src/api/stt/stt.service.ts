export type OpenAiSttResponseFormat = 'json' | 'text' | 'srt' | 'vtt' | 'verbose_json';

export type OpenAiSttOptions = {
  model: string;
  language?: string;
  prompt?: string;
  responseFormat?: OpenAiSttResponseFormat;
  temperature?: number;
};

const DEFAULT_STT_BASE_URL = 'https://qwen-qwen3-asr-demo.ms.show';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 AppleWebKit/537.36 Chrome/143 Safari/537';

type UpstreamTranscription = {
  text: string;
  lang?: string;
};

const getSttBaseUrl = () => DEFAULT_STT_BASE_URL;

const getUpstreamHeaders = (baseUrl: string, extra?: Record<string, string>) => ({
  'User-Agent': DEFAULT_USER_AGENT,
  Referer: baseUrl,
  ...(extra || {}),
});

const parseSseData = (eventStream: string) => {
  const blocks = eventStream
    .split(/\r?\n\r?\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const lines = blocks[index].split(/\r?\n/);
    const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
    const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim());
    if (eventName === 'complete' && dataLines.length > 0) {
      return dataLines.join('\n');
    }
  }

  const fallbackData = eventStream
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'));

  const lastFallbackData = fallbackData.length > 0 ? fallbackData[fallbackData.length - 1] : undefined;

  return lastFallbackData ? lastFallbackData.slice(5).trim() : '';
};

const uploadFileToUpstream = async (file: Express.Multer.File, baseUrl: string) => {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(file.buffer)], {
    type: file.mimetype || 'application/octet-stream',
  });
  formData.append('files', blob, file.originalname || 'audio');

  const uploadRes = await fetch(`${baseUrl}/gradio_api/upload`, {
    method: 'POST',
    headers: getUpstreamHeaders(baseUrl),
    body: formData,
  });

  if (!uploadRes.ok) {
    const maybeText = await uploadRes.text().catch(() => '');
    throw new Error(`STT upload failed (${uploadRes.status}): ${maybeText.slice(0, 200)}`);
  }

  const uploadPayload = (await uploadRes.json()) as unknown;
  const uploadPath = Array.isArray(uploadPayload) && typeof uploadPayload[0] === 'string' ? uploadPayload[0] : '';
  if (!uploadPath) {
    throw new Error('STT upload failed: missing upload path');
  }

  return uploadPath;
};

const callAsrInference = async (
  baseUrl: string,
  uploadPath: string,
  fileName: string,
  options: Pick<OpenAiSttOptions, 'model' | 'prompt'>
): Promise<UpstreamTranscription> => {
  const audioUrl = `${baseUrl}/gradio_api/file=${uploadPath}`;
  const invokeBody = {
    data: [
      {
        path: audioUrl,
        url: audioUrl,
        orig_name: fileName,
        meta: {
          _type: 'gradio.FileData',
        },
      },
      options.prompt || '',
      'auto',
      options.model.endsWith('itn'),
    ],
  };

  const invokeRes = await fetch(`${baseUrl}/gradio_api/call/asr_inference`, {
    method: 'POST',
    headers: getUpstreamHeaders(baseUrl, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(invokeBody),
  });

  if (!invokeRes.ok) {
    const maybeText = await invokeRes.text().catch(() => '');
    throw new Error(`STT inference invoke failed (${invokeRes.status}): ${maybeText.slice(0, 200)}`);
  }

  const invokePayload = (await invokeRes.json()) as { event_id?: string };
  if (!invokePayload?.event_id) {
    throw new Error('STT inference invoke failed: missing event_id');
  }

  const resultRes = await fetch(`${baseUrl}/gradio_api/call/asr_inference/${invokePayload.event_id}`, {
    method: 'GET',
    headers: getUpstreamHeaders(baseUrl),
  });

  if (!resultRes.ok) {
    const maybeText = await resultRes.text().catch(() => '');
    throw new Error(`STT inference result failed (${resultRes.status}): ${maybeText.slice(0, 200)}`);
  }

  const resultEventStream = await resultRes.text();
  const dataString = parseSseData(resultEventStream);
  if (!dataString) {
    throw new Error('STT inference result failed: missing data payload');
  }

  const data = JSON.parse(dataString) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('STT inference result failed: invalid data payload');
  }

  return {
    text: typeof data[0] === 'string' ? data[0] : '',
    lang: typeof data[1] === 'string' ? data[1] : undefined,
  };
};

export async function transcribeVoiceFileToText(
  file: Express.Multer.File,
  options: Pick<OpenAiSttOptions, 'model' | 'prompt'>
): Promise<UpstreamTranscription> {
  const baseUrl = getSttBaseUrl();
  const uploadPath = await uploadFileToUpstream(file, baseUrl);
  return callAsrInference(baseUrl, uploadPath, file.originalname || 'audio', options);
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
  const transcription = await transcribeVoiceFileToText(file, {
    model: options.model,
    prompt: options.prompt,
  });

  const responseFormat = options.responseFormat ?? 'json';
  const normalizedText = typeof transcription.text === 'string' ? transcription.text.trim() : '';

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
      language: transcription.lang || options.language || 'zh',
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
