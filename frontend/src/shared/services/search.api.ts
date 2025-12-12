import api from './http';

export const searchApi = {
  searchMessages: (
    serverId: string,
    params: { q: string; channelId?: string; limit?: number; page?: number }
  ) => api.get(`/servers/${serverId}/search`, { params }),
};

export default searchApi;

