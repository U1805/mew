import { z } from 'zod';

export const updateMyServerNotificationSettingsSchema = z.object({
  body: z.object({
    notificationLevel: z.enum(['ALL_MESSAGES', 'MENTIONS_ONLY', 'MUTE']).optional(),
  }),
});

