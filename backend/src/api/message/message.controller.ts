import { Request, Response } from 'express';
import * as messageService from './message.service';
import { createMessageSchema, getMessagesSchema, updateMessageSchema } from './message.validation';
import { UnauthorizedError } from '../../utils/errors';
import asyncHandler from '../../utils/asyncHandler';

export const createMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { content } = createMessageSchema.parse(req).body;

  const message = await messageService.createMessage({
    channelId: req.params.channelId,
    authorId: req.user.id,
    content,
  });

  res.status(201).json(message);
});

export const getMessagesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params;
  const { query } = getMessagesSchema.parse({ query: req.query });

  const messages = await messageService.getMessagesByChannel({
    channelId,
    ...query,
  });

  res.status(200).json(messages);
});

export const updateMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { content } = updateMessageSchema.parse(req).body;

  const updatedMessage = await messageService.updateMessage(
    req.params.messageId,
    req.user.id,
    content
  );

  res.status(200).json(updatedMessage);
});

export const deleteMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const result = await messageService.deleteMessage(
    req.params.messageId,
    req.user.id
  );

  res.status(200).json(result);
});

export const addReactionHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { messageId, emoji } = req.params;
  const updatedMessage = await messageService.addReaction(
    messageId,
    req.user.id,
    emoji
  );

  res.status(200).json(updatedMessage);
});

export const removeReactionHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { messageId, emoji } = req.params;
  const updatedMessage = await messageService.removeReaction(
    messageId,
    req.user.id,
    emoji
  );

  res.status(200).json(updatedMessage);
});
