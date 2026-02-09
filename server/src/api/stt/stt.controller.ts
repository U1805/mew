import type { NextFunction, Request, Response } from 'express';
import { BadRequestError } from '../../utils/errors';
import { transcribeForOpenAiCompat, type OpenAiSttResponseFormat } from './stt.service';

const ALLOWED_RESPONSE_FORMATS: OpenAiSttResponseFormat[] = ['json', 'text', 'srt', 'vtt', 'verbose_json'];

export const createTranscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new BadRequestError('file is required');
    }

    const modelRaw = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
    if (!modelRaw) {
      throw new BadRequestError('model is required');
    }

    const language = typeof req.body?.language === 'string' ? req.body.language.trim() : undefined;
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : undefined;
    const responseFormatRaw = typeof req.body?.response_format === 'string' ? req.body.response_format.trim() : 'json';
    const responseFormat = responseFormatRaw as OpenAiSttResponseFormat;
    if (!ALLOWED_RESPONSE_FORMATS.includes(responseFormat)) {
      throw new BadRequestError('response_format is invalid');
    }

    const temperatureRaw = req.body?.temperature;
    const temperature = temperatureRaw == null || temperatureRaw === '' ? undefined : Number(temperatureRaw);
    if (temperature != null && Number.isNaN(temperature)) {
      throw new BadRequestError('temperature must be a number');
    }

    const payload = await transcribeForOpenAiCompat(req.file, {
      model: modelRaw,
      language,
      prompt,
      responseFormat,
      temperature,
    });

    if (responseFormat === 'text') {
      return res.status(200).type('text/plain').send(payload);
    }
    if (responseFormat === 'srt') {
      return res.status(200).type('application/x-subrip').send(payload);
    }
    if (responseFormat === 'vtt') {
      return res.status(200).type('text/vtt').send(payload);
    }

    return res.status(200).json(payload);
  } catch (err) {
    return next(err as Error);
  }
};

