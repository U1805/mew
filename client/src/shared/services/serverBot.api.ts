import api from './http';

export const serverBotApi = {
  search: (serverId: string, query: string) => api.get(`/servers/${serverId}/bots/search`, { params: { q: query } }),
  invite: (serverId: string, botUserId: string) => api.post(`/servers/${serverId}/bots/${botUserId}`, {}),
};

export default serverBotApi;

