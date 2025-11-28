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

export const createMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required'),
  }),
});

export const updateMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required'),
  }),
});
