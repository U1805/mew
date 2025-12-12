import { Request, Response } from 'express';
import userService from './user.service';
import channelService from '../channel/channel.service';
import { UnauthorizedError, BadRequestError } from '../../utils/errors';
import { uploadFile } from '../../utils/s3';
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

export const updateMeHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const updateData: { username?: string; avatarUrl?: string } = {};

  // For now, we only support avatar updates. Username can be added later.
  // const { username } = req.body;
  // if (username) updateData.username = username;

  if (req.file) {
    const result = await uploadFile(req.file);
    updateData.avatarUrl = result.key; // Store the S3 key
  }

  if (Object.keys(updateData).length === 0) {
    throw new BadRequestError('No update data provided.');
  }

  const updatedUser = await userService.updateMe(req.user.id, updateData);
  res.status(200).json(updatedUser);
});
