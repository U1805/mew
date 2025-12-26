import api from './http';

export const webhookApi = {
  list: (serverId: string, channelId: string) =>
    api.get(`/servers/${serverId}/channels/${channelId}/webhooks`),
  getToken: (serverId: string, channelId: string, webhookId: string) =>
    api.get(`/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}/token`),
  create: (
    serverId: string,
    channelId: string,
    data: FormData
  ) => api.post(`/servers/${serverId}/channels/${channelId}/webhooks`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (
    serverId: string,
    channelId: string,
    webhookId: string,
    data: FormData
  ) =>
    api.patch(
      `/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`,
      data,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ),
  resetToken: (serverId: string, channelId: string, webhookId: string) =>
    api.post(`/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}/reset-token`),
  delete: (serverId: string, channelId: string, webhookId: string) =>
    api.delete(`/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`),
};

export default webhookApi;

