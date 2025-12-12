import api from './http';

export const inviteApi = {
  create: (serverId: string, data: { maxUses?: number; expiresAt?: string } = {}) =>
    api.post(`/servers/${serverId}/invites`, data),
  get: (code: string) => api.get(`/invites/${code}`),
  accept: (code: string) => api.post(`/invites/${code}`, {}),
};

export default inviteApi;

