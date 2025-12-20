import { z } from 'zod';

export const createServerSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Server name is required'),
    avatarUrl: z.string().url('Invalid URL').optional(),
  }),
});

export const updateServerSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Server name is required').optional(),
    avatarUrl: z.string().url('Invalid URL').optional(),
  }),
});
