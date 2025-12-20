import api from './http';

export const roleApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/roles`),
  create: (serverId: string, data: { name: string; permissions: string[]; color: string }) =>
    api.post(`/servers/${serverId}/roles`, data),
  update: (
    serverId: string,
    roleId: string,
    data: Partial<{ name: string; permissions: string[]; color: string }>
  ) => api.patch(`/servers/${serverId}/roles/${roleId}`, data),
  updatePositions: (serverId: string, positions: { roleId: string; position: number }[]) =>
    api.patch(`/servers/${serverId}/roles/positions`, positions),
  delete: (serverId: string, roleId: string) => api.delete(`/servers/${serverId}/roles/${roleId}`),
};

export default roleApi;

