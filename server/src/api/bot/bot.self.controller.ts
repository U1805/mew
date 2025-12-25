import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import * as botService from './bot.service';

export const updateBotConfigAsBotHandler = asyncHandler(async (req: Request, res: Response) => {
  const botUserId = req.user!.id;
  const { botId } = req.params;
  const { system_prompt } = req.body as { system_prompt: string };

  const updated = await botService.updateBotConfigAsBot(botId, botUserId, { system_prompt });
  res.status(200).json({ config: updated.config });
});

