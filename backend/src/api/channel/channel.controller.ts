import { Request, Response } from 'express';
import * as channelService from './channel.service';
import { NotFoundError, ForbiddenError } from '../../utils/errors';

export const createChannelHandler = async (req: Request, res: Response) => {
  try {
    const data = {
      ...req.body,
      serverId: req.params.serverId,
    };

    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const channel = await channelService.createChannel(data, req.user.id);
    res.status(201).json(channel);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ message: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ message: error.message });
    }
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};
