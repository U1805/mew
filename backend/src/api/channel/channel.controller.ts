import { Request, Response } from 'express';
import * as channelService from './channel.service';
import { UnauthorizedError } from '../../utils/errors';
import asyncHandler from '../../utils/asyncHandler';

export const createChannelHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = {
    ...req.body,
    serverId: req.params.serverId,
  };

  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const channel = await channelService.createChannel(data, req.user.id);
  res.status(201).json(channel);
});

export const updateChannelHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const channel = await channelService.updateChannel(
    req.params.channelId,
    req.user.id,
    req.body
  );
  res.status(200).json(channel);
});

export const deleteChannelHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const result = await channelService.deleteChannel(
    req.params.channelId,
    req.user.id
  );
  res.status(200).json(result);
});
