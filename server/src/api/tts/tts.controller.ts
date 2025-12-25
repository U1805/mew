import type { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../../utils/errors';
import { ttsService } from './tts.service';

export const synthesizeTts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestError('text is required');
    if (trimmed.length > 2000) throw new BadRequestError('text is too long');

    const audio = await ttsService.synthesizeMp3(trimmed, 'doubao');

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audio);
  } catch (err) {
    return next(err as Error);
  }
};

