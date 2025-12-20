import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../../utils/errors';
import channelService from './channel.service';
import readStateService from './readState.service';
import serverService from '../server/server.service';

export const createChannelHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError('User not authenticated');

    const { serverId } = req.params;
    const server = await serverService.getServerById(serverId);

    if (!server) throw new NotFoundError('Server not found');

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

export const getPermissionOverridesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params as { channelId: string };
  const overrides = await channelService.getPermissionOverrides(channelId);
  res.status(200).json(overrides);
});

export const updatePermissionOverridesHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }
  const { channelId } = req.params as { channelId: string };
  const overrides = await channelService.updatePermissionOverrides(channelId, req.body, req.user.id);
  res.status(200).json(overrides);
});

export const ackChannelHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  const { channelId } = req.params;
  const { lastMessageId } = req.body;

  await readStateService.ackChannel(req.user.id, channelId, lastMessageId);

  res.status(204).send();
});
