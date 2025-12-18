import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import * as botService from './bot.service';

export const createBotHandler = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const newBot = await botService.createBot(ownerId, req.body, req.file);
  res.status(201).json(newBot);
});

export const getBotsHandler = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const bots = await botService.getBotsByOwner(ownerId);
  res.status(200).json(bots);
});

export const getBotHandler = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const { botId } = req.params;
  const bot = await botService.getBotById(botId, ownerId);
  res.status(200).json(bot);
});

export const updateBotHandler = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const { botId } = req.params;
  const updatedBot = await botService.updateBot(botId, ownerId, req.body, req.file);
  res.status(200).json(updatedBot);
});

export const deleteBotHandler = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const { botId } = req.params;
  await botService.deleteBot(botId, ownerId);
  res.status(204).send();
});

export const regenerateTokenHandler = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const { botId } = req.params;
  const newAccessToken = await botService.regenerateAccessToken(botId, ownerId);
  res.status(200).json({ accessToken: newAccessToken });
});
