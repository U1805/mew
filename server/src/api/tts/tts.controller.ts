import type { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../../utils/errors';
import { ttsService } from './tts.service';

const TTS_CHUNK_SIZE = 1800;
const TTS_MAX_CHARS = 12000;

const splitTtsText = (input: string) => {
  const text = input.trim();
  if (!text) return [];

  const chunks: string[] = [];
  let buf = '';

  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed) chunks.push(trimmed);
    buf = '';
  };

  const pushToken = (token: string) => {
    if (!token) return;
    if (!buf) {
      if (token.length <= TTS_CHUNK_SIZE) {
        buf = token;
        return;
      }
      // Hard split extremely long tokens.
      for (let i = 0; i < token.length; i += TTS_CHUNK_SIZE) {
        const part = token.slice(i, i + TTS_CHUNK_SIZE).trim();
        if (part) chunks.push(part);
      }
      return;
    }

    if ((buf + token).length <= TTS_CHUNK_SIZE) {
      buf += token;
      return;
    }

    flush();
    pushToken(token);
  };

  // Split by common sentence delimiters (CN + EN) while keeping delimiters.
  const tokens = text.split(/(?<=[。！？!?；;…])|\n+/g);
  for (const raw of tokens) {
    const token = raw;
    if (!token) continue;
    pushToken(token);
  }
  flush();

  return chunks;
};

export const synthesizeTts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestError('text is required');
    if (trimmed.length > TTS_MAX_CHARS) throw new BadRequestError(`text is too long (max ${TTS_MAX_CHARS} chars)`);

    const parts = trimmed.length > TTS_CHUNK_SIZE ? splitTtsText(trimmed) : [trimmed];
    if (parts.length === 0) throw new BadRequestError('text is required');

    const buffers: Buffer[] = [];
    for (const part of parts) {
      buffers.push(await ttsService.synthesizeMp3(part, 'doubao'));
    }
    const audio = Buffer.concat(buffers);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audio);
  } catch (err) {
    return next(err as Error);
  }
};
