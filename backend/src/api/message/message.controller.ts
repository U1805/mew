import { Request, Response } from 'express';
import * as messageService from './message.service';
import { createMessageSchema, getMessagesSchema, updateMessageSchema } from './message.validation';
import { ForbiddenError, NotFoundError } from '../../utils/errors';

export const createMessageHandler = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { content } = createMessageSchema.parse(req).body;

    const message = await messageService.createMessage({
      channelId: req.params.channelId,
      authorId: req.user.id,
      content,
    });

    res.status(201).json(message);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};

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

export const updateMessageHandler = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { content } = updateMessageSchema.parse(req).body;

    const updatedMessage = await messageService.updateMessage(
      req.params.messageId,
      req.user.id,
      content
    );

    res.status(200).json(updatedMessage);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ message: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ message: error.message });
    }
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};

export const deleteMessageHandler = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const result = await messageService.deleteMessage(
      req.params.messageId,
      req.user.id
    );

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ message: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ message: error.message });
    }
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};

export const addReactionHandler = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { messageId, emoji } = req.params;
    const updatedMessage = await messageService.addReaction(
      messageId,
      req.user.id,
      emoji
    );

    res.status(200).json(updatedMessage);
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

export const removeReactionHandler = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { messageId, emoji } = req.params;
    const updatedMessage = await messageService.removeReaction(
      messageId,
      req.user.id,
      emoji
    );

    res.status(200).json(updatedMessage);
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