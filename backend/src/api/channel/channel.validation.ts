import { z } from 'zod';
import { ChannelType } from './channel.model';

export const createChannelSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Channel name is required'),
    // 确保枚举值匹配前端发送的字符串
    type: z.enum([ChannelType.GUILD_TEXT, ChannelType.DM]),
    categoryId: z.string().optional(),
  }),
  // 新增：显式校验 serverId 参数
  params: z.object({
    serverId: z.string().min(1),
  }),
});

export const updateChannelSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Channel name is required').optional(),
    categoryId: z.string().nullable().optional(),
  }),
  // update 路由通常只有 channelId，但在 REST 设计中若包含 serverId 也可校验
  params: z.object({
    channelId: z.string().min(1),
  }),
});

import { ALL_PERMISSIONS } from '../../constants/permissions';

const permissionOverrideSchema = z.object({
  targetType: z.enum(['role', 'member']),
  targetId: z.string(),
  allow: z.array(z.enum(ALL_PERMISSIONS)).default([]),
  deny: z.array(z.enum(ALL_PERMISSIONS)).default([]),
});

export const updatePermissionsSchema = z.object({
  body: z.array(permissionOverrideSchema),
  params: z.object({
    channelId: z.string().min(1),
  }),
});


export const ackChannelSchema = z.object({
  body: z.object({
    lastMessageId: z.string().min(1, 'lastMessageId is required'),
  }),
  params: z.object({
    channelId: z.string().min(1, 'channelId is required'),
  }),
});
