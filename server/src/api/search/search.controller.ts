import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import { searchMessagesInServer } from './search.service';

export const searchMessagesHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const {
      q,
      channelId,
      limit,
      page,
    } = req.query as { [key: string]: string };

    const result = await searchMessagesInServer({
      serverId,
      query: q,
      channelId,
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    });

    res.status(200).json(result);
  }
);
