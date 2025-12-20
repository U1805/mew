import { z } from 'zod';

export const searchMessagesSchema = z.object({
  query: z.object({
    q: z.string().min(1, 'Search query (q) cannot be empty'),
    channelId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    page: z.coerce.number().int().min(1).optional().default(1),
  }),
});
