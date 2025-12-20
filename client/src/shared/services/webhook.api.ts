import api from './http';

export const webhookApi = {
  list: (serverId: string, channelId: string) =>
    api.get(`/servers/${serverId}/channels/${channelId}/webhooks`),
  create: (
    serverId: string,
    channelId: string,
    data: { name: string; avatarUrl?: string }
  ) => api.post(`/servers/${serverId}/channels/${channelId}/webhooks`, data),
  update: (
    serverId: string,
    channelId: string,
    webhookId: string,
    data: { name?: string; avatarUrl?: string }
  ) =>
    api.patch(
      `/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`,
      data
    ),
  delete: (serverId: string, channelId: string, webhookId: string) =>
    api.delete(`/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`),
};

export default webhookApi;

