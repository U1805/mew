const QWEN_TTS_BASE_URL = 'https://qwen-qwen3-tts-demo.ms.show';
const QWEN_DEFAULT_VOICE = 'Chelsie / 千雪';
const QWEN_DEFAULT_LANGUAGE = 'Auto / 自动';

let qwenVoiceMapCache: Map<string, string> | null = null;

const parseCompleteSseData = (eventStream: string) => {
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

  return '';
};

const getQwenHeaders = (baseUrl: string, extra?: Record<string, string>) => ({
  'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/143 Safari/537',
  Referer: baseUrl,
  ...(extra || {}),
});

const getQwenVoiceMap = async () => {
  if (qwenVoiceMapCache) return qwenVoiceMapCache;

  const infoRes = await fetch(`${QWEN_TTS_BASE_URL}/gradio_api/info`, {
    method: 'GET',
    headers: getQwenHeaders(QWEN_TTS_BASE_URL),
  });

  if (!infoRes.ok) {
    const maybeText = await infoRes.text().catch(() => '');
    throw new Error(`TTS upstream error (${infoRes.status}): ${maybeText.slice(0, 200)}`);
  }

  const infoPayload = (await infoRes.json()) as {
    named_endpoints?: {
      '/tts_interface'?: {
        parameters?: Array<{
          parameter_name?: string;
          type?: { enum?: string[] };
        }>;
      };
    };
  };

  const voiceEnums =
    infoPayload.named_endpoints?.['/tts_interface']?.parameters?.find((parameter) => parameter.parameter_name === 'voice_display')
      ?.type?.enum || [];

  const map = new Map<string, string>();
  for (const displayName of voiceEnums) {
    const voiceId = String(displayName).toLowerCase().split('/')[0]?.trim();
    if (!voiceId) continue;
    if (!map.has(voiceId)) {
      map.set(voiceId, displayName);
    }
  }

  qwenVoiceMapCache = map;
  return map;
};

const resolveQwenVoiceDisplay = async (voice: string) => {
  const voiceMap = await getQwenVoiceMap();
  const voiceId = voice.trim().toLowerCase();
  if (voiceMap.has(voiceId)) {
    return voiceMap.get(voiceId) as string;
  }
  if (voice.includes('/')) {
    return voice;
  }
  return voiceMap.get('vivian') || QWEN_DEFAULT_VOICE;
};

export const fetchQwen3Upstream = async (text: string, voice: string) => {
  const voiceDisplay = await resolveQwenVoiceDisplay(voice);
  const invokeRes = await fetch(`${QWEN_TTS_BASE_URL}/gradio_api/call/tts_interface`, {
    method: 'POST',
    headers: getQwenHeaders(QWEN_TTS_BASE_URL, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      data: [text, voiceDisplay, QWEN_DEFAULT_LANGUAGE],
    }),
  });

  if (!invokeRes.ok) {
    const maybeText = await invokeRes.text().catch(() => '');
    throw new Error(`TTS upstream error (${invokeRes.status}): ${maybeText.slice(0, 200)}`);
  }

  const invokePayload = (await invokeRes.json()) as { event_id?: string };
  if (!invokePayload?.event_id) {
    throw new Error('TTS upstream error (500): missing event_id');
  }

  const resultRes = await fetch(`${QWEN_TTS_BASE_URL}/gradio_api/call/tts_interface/${invokePayload.event_id}`, {
    method: 'GET',
    headers: getQwenHeaders(QWEN_TTS_BASE_URL),
  });

  if (!resultRes.ok) {
    const maybeText = await resultRes.text().catch(() => '');
    throw new Error(`TTS upstream error (${resultRes.status}): ${maybeText.slice(0, 200)}`);
  }

  const eventStream = await resultRes.text();
  const dataRaw = parseCompleteSseData(eventStream);
  if (!dataRaw) {
    throw new Error('TTS upstream error (500): missing result payload');
  }

  const payload = JSON.parse(dataRaw) as unknown;
  const file = Array.isArray(payload) ? payload[0] : null;

  const audioUrl =
    file && typeof file === 'object' && 'url' in file && typeof (file as { url?: unknown }).url === 'string'
      ? (file as { url: string }).url
      : file && typeof file === 'object' && 'path' in file && typeof (file as { path?: unknown }).path === 'string'
        ? `${QWEN_TTS_BASE_URL}/gradio_api/file=${(file as { path: string }).path}`
        : '';

  if (!audioUrl) {
    throw new Error('TTS upstream error (500): missing audio url');
  }

  const audioRes = await fetch(audioUrl, {
    method: 'GET',
    headers: getQwenHeaders(QWEN_TTS_BASE_URL),
  });

  if (!audioRes.ok) {
    const maybeText = await audioRes.text().catch(() => '');
    throw new Error(`TTS upstream error (${audioRes.status}): ${maybeText.slice(0, 200)}`);
  }

  return audioRes;
};

