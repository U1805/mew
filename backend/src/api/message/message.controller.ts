import { Request, Response } from 'express';
import * as messageService from './message.service';
import { getMessagesSchema } from './message.validation';

export const getMessagesHandler = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { query } = getMessagesSchema.parse({ query: req.query });

    const messages = await messageService.getMessagesByChannel({
      channelId,
      ...query,
    });

    res.status(200).json(messages);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};
