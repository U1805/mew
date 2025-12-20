import api from './http';
import { roleApi } from './role.api';
import { memberApi } from './member.api';

export const serverApi = {
  list: () => api.get('/users/@me/servers'),
  create: (data: { name: string }) => api.post('/servers', data),
  get: (id: string) => api.get(`/servers/${id}`),
  update: (id: string, data: { name?: string; avatarUrl?: string }) =>
    api.patch(`/servers/${id}`, data),
  uploadIcon: (id: string, data: FormData) => api.post(`/servers/${id}/icon`, data),
  delete: (id: string) => api.delete(`/servers/${id}`),
  getRoles: (serverId: string) => roleApi.list(serverId),
  getMembers: (serverId: string) => memberApi.list(serverId),
  leaveServer: (serverId: string) => memberApi.leave(serverId),
  kickMember: (serverId: string, userId: string) => memberApi.kick(serverId, userId),
};

export default serverApi;