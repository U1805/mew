import { z } from 'zod';

export const getMessagesSchema = z.object({
  query: z.object({
    limit: z.preprocess(
      (val) => (val ? parseInt(val as string, 10) : 50),
      z.number().min(1).max(100).default(50)
    ),
    before: z.string().optional(), // Expecting a message ID (MongoDB ObjectId)
  }),
});

const attachmentSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  key: z.string().min(1, 'Attachment key cannot be empty'),
  size: z.number(),
});

export const createMessageSchema = z.object({
  body: z.object({
    content: z.string().optional(), // Content can be optional if there are attachments
    attachments: z.array(attachmentSchema).optional(),
  }).refine(data => (data.content && data.content.trim() !== '') || (data.attachments && data.attachments.length > 0), {
    message: 'A message must have either content or at least one attachment.',
  }),
});

export const updateMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required'),
  }),
});
