import { Request, Response } from 'express';
import * as userService from './user.service';
import * as channelService from '../channel/channel.service';

export const getMeHandler = async (req: Request, res: Response) => {
  try {
    // The user object is attached to the request by the 'protect' middleware
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const user = await userService.getMe(req.user.id);
    res.status(200).json(user);
  } catch (error) {
    if (error instanceof Error) {
        return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};

export const createDmChannelHandler = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { recipientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient ID is required' });
    }

    const channel = await channelService.createDmChannel(req.user.id, recipientId);
    res.status(201).json(channel);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};