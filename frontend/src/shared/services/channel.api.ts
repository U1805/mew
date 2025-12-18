import api from './http';

export const channelApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/channels`),
  create: (serverId: string, data: { name: string; type: string; categoryId?: string }) =>
    api.post(`/servers/${serverId}/channels`, data),
  update: (
    serverId: string,
    channelId: string,
    data: { name?: string; categoryId?: string | null; topic?: string }
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
};

export default channelApi;

