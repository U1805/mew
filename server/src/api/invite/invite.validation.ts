import { z } from 'zod';

export const createInviteSchema = z.object({
  body: z.object({
    expiresAt: z.string().datetime().optional(),
    maxUses: z.number().int().min(0).optional(),
  }),
});
