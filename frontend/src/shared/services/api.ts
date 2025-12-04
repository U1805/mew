import axios from 'axios';

export interface LoginResponse {
  token: string;
}
import { useAuthStore } from '../stores/store';

export const API_URL = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (data: any) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  getMe: () => api.get('/users/@me'),
};

export const userApi = {
  search: (query: string) => api.get('/users/search', { params: { q: query } }),
};

export const serverApi = {
  list: () => api.get('/users/@me/servers'),
  create: (data: { name: string }) => api.post('/servers', data),
  get: (id: string) => api.get(`/servers/${id}`),
  update: (id: string, data: { name?: string; avatarUrl?: string }) => api.patch(`/servers/${id}`, data),
  delete: (id: string) => api.delete(`/servers/${id}`),
  getMembers: (id: string) => api.get(`/servers/${id}/members`),
  kickMember: (serverId: string, userId: string) => api.delete(`/servers/${serverId}/members/${userId}`),
  leaveServer: (serverId: string) => api.delete(`/servers/${serverId}/members/@me`),
};

export const inviteApi = {
  create: (serverId: string, data: { maxUses?: number; expiresAt?: string } = {}) => api.post(`/servers/${serverId}/invites`, data),
  get: (code: string) => api.get(`/invites/${code}`),
  accept: (code: string) => api.post(`/invites/${code}`, {}),
};

export const categoryApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/categories`),
  create: (serverId: string, data: { name: string }) => api.post(`/servers/${serverId}/categories`, data),
  update: (categoryId: string, data: { name?: string; position?: number }) => api.patch(`/categories/${categoryId}`, data),
  delete: (categoryId: string) => api.delete(`/categories/${categoryId}`),
}

export const channelApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/channels`),
  create: (serverId: string, data: { name: string; type: string; categoryId?: string }) => api.post(`/servers/${serverId}/channels`, data),
  update: (serverId: string, channelId: string, data: { name?: string; categoryId?: string | null }) => api.patch(`/servers/${serverId}/channels/${channelId}`, data),
  createDM: (recipientId: string) => api.post(`/users/@me/channels`, { recipientId }),
  listDMs: () => api.get(`/users/@me/channels`),
  delete: (serverId: string | undefined, channelId: string) => {
      // Adjusted based on typical REST patterns or previous usage
      return api.delete(`/servers/${serverId}/channels/${channelId}`);
  }
};

export const messageApi = {
  list: (serverId: string | undefined, channelId: string) => {
      const prefix = serverId ? `/servers/${serverId}` : '';
      return api.get(`${prefix}/channels/${channelId}/messages`);
  },
  send: (serverId: string | undefined, channelId: string, data: { content: string }) => {
      const prefix = serverId ? `/servers/${serverId}` : '';
      return api.post(`${prefix}/channels/${channelId}/messages`, data);
  },
  update: (serverId: string | undefined, channelId: string, messageId: string, content: string) => {
      const prefix = serverId ? `/servers/${serverId}` : '';
      return api.patch(`${prefix}/channels/${channelId}/messages/${messageId}`, { content });
  },
  delete: (serverId: string | undefined, channelId: string, messageId: string) => {
      const prefix = serverId ? `/servers/${serverId}` : '';
      return api.delete(`${prefix}/channels/${channelId}/messages/${messageId}`);
  },
  addReaction: (serverId: string | undefined, channelId: string, messageId: string, emoji: string) => {
      const prefix = serverId ? `/servers/${serverId}` : '';
      // Emoji must be URL encoded
      const encodedEmoji = encodeURIComponent(emoji);
      return api.put(`${prefix}/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`);
  },
  removeReaction: (serverId: string | undefined, channelId: string, messageId: string, emoji: string) => {
      const prefix = serverId ? `/servers/${serverId}` : '';
      const encodedEmoji = encodeURIComponent(emoji);
      return api.delete(`${prefix}/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`);
  }
};

export const webhookApi = {
  list: (serverId: string, channelId: string) => api.get(`/servers/${serverId}/channels/${channelId}/webhooks`),
  create: (serverId: string, channelId: string, data: { name: string; avatarUrl?: string }) => api.post(`/servers/${serverId}/channels/${channelId}/webhooks`, data),
  update: (serverId: string, channelId: string, webhookId: string, data: { name?: string; avatarUrl?: string }) => api.patch(`/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`, data),
  delete: (serverId: string, channelId: string, webhookId: string) => api.delete(`/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`),
};

export default api;
