import { z } from 'zod';
import { ChannelType } from './channel.model';

export const createChannelSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Channel name is required'),
    type: z.enum([ChannelType.GUILD_TEXT, ChannelType.DM]),
    categoryId: z.string().optional(),
  }),
});

export const updateChannelSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Channel name is required').optional(),
    categoryId: z.string().optional(),
  }),
});
