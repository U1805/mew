import { z } from 'zod';

export const updateBotConfigAsBotSchema = z.object({
  body: z.object({
    system_prompt: z.string().min(1, 'system_prompt is required').max(20000, 'system_prompt too long'),
  }),
});

