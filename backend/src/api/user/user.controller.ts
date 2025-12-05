import { Request, Response } from 'express';
import * as userService from './user.service';
import * as channelService from '../channel/channel.service';
import { UnauthorizedError } from '../../utils/errors';
import asyncHandler from '../../utils/asyncHandler';

export const getMeHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  const user = await userService.getMe(req.user.id);
  res.status(200).json(user);
});

export const getDmChannelsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const channels = await channelService.getDmChannelsByUser(req.user.id);
  res.status(200).json(channels);
});

export const createDmChannelHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { recipientId } = req.body;
  if (!recipientId) {
    return res.status(400).json({ message: 'Recipient ID is required' });
  }

  const channel = await channelService.createDmChannel(req.user.id, recipientId);
  res.status(201).json(channel);
});

export const searchUsersHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  const query = req.query.q as string;
  if (!query) {
    return res.status(200).json([]); // 如果查询为空，返回空数组
  }
  const users = await userService.searchUsers(query, req.user.id);
  res.status(200).json(users);
});

export const getUserByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getUserById(req.params.userId);
  res.status(200).json(user);
});
