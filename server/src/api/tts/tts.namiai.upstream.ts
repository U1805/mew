import crypto from 'crypto';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';

const md5 = (msg: string) => crypto.createHash('md5').update(msg, 'utf8').digest('hex');

const hashE = (input: string) => {
  const HASH_MASK_1 = 268435455;
  const HASH_MASK_2 = 266338304;

  let at = 0;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    const st = input.charCodeAt(i);
    at = ((at << 6) & HASH_MASK_1) + st + (st << 14);
    const it = at & HASH_MASK_2;
    if (it !== 0) {
      at ^= it >> 21;
    }
  }
  return at;
};

const getIso8601TimeCN = () => {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const cn = new Date(utcMs + 8 * 60 * 60_000);

  const pad2 = (n: number) => `${n}`.padStart(2, '0');
  return `${cn.getFullYear()}-${pad2(cn.getMonth() + 1)}-${pad2(cn.getDate())}T${pad2(cn.getHours())}:${pad2(cn.getMinutes())}:${pad2(
    cn.getSeconds()
  )}+08:00`;
};

const generateUniqueHash = () => {
  const lang = 'zh-CN';
  const appName = 'chrome';
  const ver = 1.0;
  const platform = 'Win32';
  const width = 1920;
  const height = 1080;
  const colorDepth = 24;
  const referrer = 'https://bot.n.cn/chat';

  let nt = `${appName}${ver}${lang}${platform}${UA}${width}x${height}${colorDepth}${referrer}`;
  let at = nt.length;
  let it = 1;
  while (it) {
    nt += String(it ^ at);
    it -= 1;
    at += 1;
  }

  const rand = crypto.randomInt(0, 2_147_483_647);
  const result = (BigInt(rand) ^ BigInt(hashE(nt))) * 2_147_483_647n;
  return result;
};

const generateMid = () => {
  const domain = 'https://bot.n.cn';
  const rt = `${hashE(domain)}${generateUniqueHash().toString()}${(Date.now() + Math.random() + Math.random()).toString()}`;
  return rt.replace('.', 'e').slice(0, 32);
};

const getHeaders = () => {
  const device = 'Web';
  const ver = '1.2';
  const timestamp = getIso8601TimeCN();
  const accessToken = generateMid();
  const zmUa = md5(UA);
  const zmToken = md5(`${device}${timestamp}${ver}${accessToken}${zmUa}`);

  return {
    'device-platform': device,
    timestamp,
    'access-token': accessToken,
    'zm-token': zmToken,
    'zm-ver': ver,
    'zm-ua': zmUa,
    'User-Agent': UA,
  };
};

export const fetchNamiaiUpstream = async (text: string, voice: string) => {
  const url = `https://bot.n.cn/api/tts/v1?roleid=${encodeURIComponent(voice)}`;
  const headers: Record<string, string> = {
    ...getHeaders(),
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const body = `&text=${encodeURIComponent(text)}&audio_type=mp3&format=stream`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  if (!res.ok) {
    const maybeText = await res.text().catch(() => '');
    throw new Error(`TTS upstream error (${res.status}): ${maybeText.slice(0, 200)}`);
  }

  const contentType = (res.headers?.get('content-type') || '').toLowerCase();
  const isAudioLike =
    contentType === '' ||
    contentType.includes('audio/') ||
    contentType.includes('application/octet-stream');

  if (!isAudioLike) {
    const maybeText = await res.text().catch(() => '');
    throw new Error(`TTS upstream non-audio response (${contentType || 'unknown'}): ${maybeText.slice(0, 200)}`);
  }

  return res;
};

