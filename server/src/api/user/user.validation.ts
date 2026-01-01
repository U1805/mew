import { z } from 'zod';

export const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(1, 'Old password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
  }),
});

export const updateMeSchema = z.object({
  body: z
    .object({
      username: z.string().trim().min(3, 'Username must be at least 3 characters long').max(32, 'Username is too long').optional(),
    })
    .default({}),
});

export const updateMyNotificationSettingsSchema = z.object({
  body: z.object({
    soundEnabled: z.boolean().optional(),
    soundVolume: z.number().min(0).max(1).optional(),
    desktopEnabled: z.boolean().optional(),
  }),
});
