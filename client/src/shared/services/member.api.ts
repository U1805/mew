import api from './http';

export const memberApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/members`),
  kick: (serverId: string, userId: string) =>
    api.delete(`/servers/${serverId}/members/${userId}`),
  leave: (serverId: string) => api.delete(`/servers/${serverId}/members/@me`),
  updateRoles: (serverId: string, userId: string, roleIds: string[]) =>
    api.put(`/servers/${serverId}/members/${userId}/roles`, { roleIds }),
};

export default memberApi;

