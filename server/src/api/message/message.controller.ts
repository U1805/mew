import { Request, Response } from 'express';
import { Types } from 'mongoose';
import * as messageService from './message.service';
import { createMessageSchema, getMessagesSchema, updateMessageSchema } from './message.validation';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import asyncHandler from '../../utils/asyncHandler';

export const createMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { content, attachments, referencedMessageId, type, payload, plainText, 'plain-text': plainTextDashed } =
    createMessageSchema.parse(req).body as any;
  const resolvedPlainText =
    (typeof plainText === 'string' ? plainText : typeof plainTextDashed === 'string' ? plainTextDashed : undefined) ??
    undefined;

  const message = await messageService.createMessage({
    channelId: new Types.ObjectId(req.params.channelId),
    authorId: new Types.ObjectId(req.user.id),
    content,
    attachments,
    ...(resolvedPlainText != null ? { plainText: resolvedPlainText } : {}),
    ...(type ? { type } : {}),
    ...(payload ? { payload } : {}),
    ...(referencedMessageId ? { referencedMessageId: new Types.ObjectId(referencedMessageId) } : {}),
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

export const transcribeVoiceMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  if (!req.file) {
    throw new BadRequestError('No file uploaded.');
  }

  const { channelId, messageId } = req.params as any;
  const text = await messageService.transcribeVoiceMessage(String(channelId), String(messageId), req.user.id, req.file as any);

  res.status(200).type('text/plain').send(text);
});
