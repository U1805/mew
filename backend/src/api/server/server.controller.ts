import { Request, Response } from 'express';
import * as serverService from './server.service';
import { NotFoundError } from '../../utils/errors';

export const createServerHandler = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const data = {
      ...req.body,
      ownerId: req.user.id,
    };

    const server = await serverService.createServer(data);
    res.status(201).json(server);
  } catch (error) {
    if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};

export const getServerHandler = async (req: Request, res: Response) => {
  try {
    const server = await serverService.getServerById(req.params.serverId);
    res.status(200).json(server);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ message: error.message });
    }
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};

export const getUserServersHandler = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const servers = await serverService.getServersForUser(req.user.id);
    res.status(200).json(servers);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};
