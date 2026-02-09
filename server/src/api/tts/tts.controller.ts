import type { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../../utils/errors';
import { ttsService } from './tts.service';

const TTS_CHUNK_SIZE = 1800;
const TTS_MAX_CHARS = 12000;

const writeSseEvent = (res: Response, payload: Record<string, unknown>) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

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
    const input = typeof req.body?.input === 'string' ? req.body.input : '';
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const voice = typeof req.body?.voice === 'string' && req.body.voice.trim() ? req.body.voice.trim() : 'doubao';
    const stream = req.body?.stream === true;
    const streamFormat = typeof req.body?.stream_format === 'string' ? req.body.stream_format : '';
    const wantSse = stream && streamFormat === 'sse';
    const wantAudioStream = stream && streamFormat !== 'sse';
    const sourceText = input || text;
    const trimmed = sourceText.trim();
    if (!trimmed) throw new BadRequestError('text is required');
    if (trimmed.length > TTS_MAX_CHARS) throw new BadRequestError(`text is too long (max ${TTS_MAX_CHARS} chars)`);

    const parts = trimmed.length > TTS_CHUNK_SIZE ? splitTtsText(trimmed) : [trimmed];
    if (parts.length === 0) throw new BadRequestError('text is required');

    if (wantSse) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Connection', 'keep-alive');

      let totalBytes = 0;
      for (const part of parts) {
        await ttsService.streamMp3(part, voice, (chunk) => {
          totalBytes += chunk.length;
          writeSseEvent(res, { type: 'speech.audio.delta', audio: chunk.toString('base64') });
        });
      }

      writeSseEvent(res, {
        type: 'speech.audio.done',
        usage: {
          input_text_length: trimmed.length,
          output_audio_bytes: totalBytes,
        },
      });
      return res.end();
    }

    if (wantAudioStream) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');

      for (const part of parts) {
        await ttsService.streamMp3(part, voice, (chunk) => {
          res.write(chunk);
        });
      }
      return res.end();
    }

    const buffers: Buffer[] = [];
    for (const part of parts) {
      buffers.push(await ttsService.synthesizeMp3(part, voice));
    }
    const audio = Buffer.concat(buffers);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audio);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('TTS upstream')) {
      return next(new BadRequestError(err.message));
    }
    return next(err as Error);
  }
};
