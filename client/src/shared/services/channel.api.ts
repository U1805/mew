import api from './http';
import type { ChannelType } from '../types';

export const channelApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/channels`),
  create: (serverId: string, data: { name: string; type: ChannelType; categoryId?: string; url?: string }) =>
    api.post(`/servers/${serverId}/channels`, data),
  update: (
    serverId: string,
    channelId: string,
    data: { name?: string; categoryId?: string | null; topic?: string; url?: string }
  ) => api.patch(`/servers/${serverId}/channels/${channelId}`, data),
  createDM: (recipientId: string) => api.post(`/users/@me/channels`, { recipientId }),
  listDMs: () => api.get(`/users/@me/channels`),
  delete: (serverId: string | undefined, channelId: string) =>
    api.delete(`/servers/${serverId}/channels/${channelId}`),
  ack: (channelId: string, lastMessageId: string) =>
    api.post(`/channels/${channelId}/ack`, { lastMessageId }),
  getPermissionOverrides: (serverId: string, channelId: string) =>
    api.get(`/servers/${serverId}/channels/${channelId}/permissions`),
  updatePermissionOverrides: (serverId: string, channelId: string, data: any) =>
    api.put(`/servers/${serverId}/channels/${channelId}/permissions`, data),
  getMyNotificationSettings: (channelId: string) => api.get(`/channels/${channelId}/notification-settings`),
  updateMyNotificationSettings: (channelId: string, data: { level: 'DEFAULT' | 'ALL_MESSAGES' | 'MENTIONS_ONLY' | 'MUTE' }) =>
    api.put(`/channels/${channelId}/notification-settings`, data),
};

export default channelApi;

