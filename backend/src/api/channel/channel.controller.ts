import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  BadRequestError
} from '../../utils/errors';
import * as channelService from './channel.service';
import * as serverService from '../server/server.service';
import ServerMember from '../member/member.model';

export const createChannelHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError('User not authenticated');

    const { serverId } = req.params;
    const server = await serverService.getServerById(serverId);

    if (!server) throw new NotFoundError('Server not found');

    const member = await ServerMember.findOne({ serverId, userId: req.user.id });
    if (!member || member.role !== 'OWNER') {
      throw new ForbiddenError(
        'User is not the owner of the server to create a channel'
      );
    }

    const newChannel = await channelService.createChannel({
      ...req.body,
      serverId,
    });

    res.status(201).json(newChannel);
  }
);

export const getChannelHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { channelId } = req.params;
    if (!req.user) throw new UnauthorizedError('User not authenticated');

    // TODO: Need a better way to check if user has access to channel

    const channel = await channelService.getChannelById(channelId);

    if (!channel) throw new NotFoundError('Channel not found');

    res.status(200).json(channel);
  }
);

export const updateChannelHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { channelId } = req.params;
    if (!req.user) throw new UnauthorizedError('User not authenticated');

    const channel = await channelService.getChannelById(channelId);
    if (!channel) throw new NotFoundError('Channel not found');

    if (!channel.serverId) {
      throw new BadRequestError('This operation is not applicable to DM channels.');
    }

    const member = await ServerMember.findOne({ serverId: channel.serverId, userId: req.user.id });
    if (!member || member.role !== 'OWNER') {
      throw new ForbiddenError('User is not the owner of the server');
    }

    const updatedChannel = await channelService.updateChannel(
      channelId,
      req.body
    );

    res.status(200).json(updatedChannel);
  }
);

export const deleteChannelHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { channelId } = req.params;
    if (!req.user) throw new UnauthorizedError('User not authenticated');

    const channel = await channelService.getChannelById(channelId);
    if (!channel) throw new NotFoundError('Channel not found');

    if (!channel.serverId) {
      throw new BadRequestError('This operation is not applicable to DM channels.');
    }

    const member = await ServerMember.findOne({ serverId: channel.serverId, userId: req.user.id });
    if (!member || member.role !== 'OWNER') {
      throw new ForbiddenError('User is not the owner of the server');
    }

    await channelService.deleteChannel(channelId);

    res.status(200).json({ message: 'Channel deleted successfully' });
  }
);

export const getChannelsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  const { serverId } = req.params;
  const channels = await channelService.getChannelsByServer(serverId, req.user.id);
  res.status(200).json(channels);
});