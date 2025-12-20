import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import * as botService from './bot.service';

export const bootstrapBotsHandler = asyncHandler(async (req: Request, res: Response) => {
  const serviceType = (req.body?.serviceType as string) || (req.query?.serviceType as string);
  if (!serviceType) {
    return res.status(400).json({ message: 'serviceType is required' });
  }

  const bots = await botService.bootstrapBots(serviceType);
  res.status(200).json({ bots });
});

export const bootstrapBotByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const { botId } = req.params;
  const serviceType = req.query?.serviceType as string | undefined;
  const bot = await botService.bootstrapBotById(botId, serviceType);
  res.status(200).json({ bot });
});
