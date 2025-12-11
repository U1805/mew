
import axios from 'axios';

export interface LoginResponse {
  token: string;
}
import { useAuthStore } from '../stores/store';
import { Attachment } from '../types';

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
  getById: (userId: string) => api.get(`/users/${userId}`),
};

export const roleApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/roles`),
  create: (serverId: string, data: { name: string, permissions: string[], color: string }) => api.post(`/servers/${serverId}/roles`, data),
  update: (serverId: string, roleId: string, data: Partial<{ name: string; permissions: string[]; color: string }>) => api.patch(`/servers/${serverId}/roles/${roleId}`, data),
  updatePositions: (serverId: string, positions: { roleId: string, position: number }[]) => api.patch(`/servers/${serverId}/roles/positions`, positions),
  delete: (serverId: string, roleId: string) => api.delete(`/servers/${serverId}/roles/${roleId}`),
};

export const memberApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/members`),
  kick: (serverId: string, userId: string) => api.delete(`/servers/${serverId}/members/${userId}`),
  leave: (serverId: string) => api.delete(`/servers/${serverId}/members/@me`),
  updateRoles: (serverId: string, userId: string, roleIds: string[]) => api.put(`/servers/${serverId}/members/${userId}/roles`, { roleIds }),
};

export const serverApi = {
  list: () => api.get('/users/@me/servers'),
  create: (data: { name: string }) => api.post('/servers', data),
  get: (id: string) => api.get(`/servers/${id}`),
  update: (id: string, data: { name?: string; avatarUrl?: string }) => api.patch(`/servers/${id}`, data),
  delete: (id: string) => api.delete(`/servers/${id}`),
  getRoles: (serverId: string) => roleApi.list(serverId),
  getMembers: (serverId: string) => memberApi.list(serverId),
  leaveServer: (serverId: string) => memberApi.leave(serverId),
  kickMember: (serverId: string, userId: string) => memberApi.kick(serverId, userId),
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
      return api.delete(`/servers/${serverId}/channels/${channelId}`);
  },
  ack: (channelId: string, lastMessageId: string) => api.post(`/channels/${channelId}/ack`, { lastMessageId }),
  getPermissionOverrides: (serverId: string, channelId: string) => api.get(`/servers/${serverId}/channels/${channelId}/permissions`),
  updatePermissionOverrides: (serverId: string, channelId: string, data: any) => api.put(`/servers/${serverId}/channels/${channelId}/permissions`, data),
};

export const messageApi = {
  list: (serverId: string | undefined, channelId: string) => {
      const prefix = serverId ? `/servers/${serverId}` : '';
      return api.get(`${prefix}/channels/${channelId}/messages`);
  },
  send: (serverId: string | undefined, channelId: string, data: { content?: string; attachments?: Attachment[] }) => {
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
      const encodedEmoji = encodeURIComponent(emoji);
      return api.put(`${prefix}/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`);
  },
  removeReaction: (serverId: string | undefined, channelId: string, messageId: string, emoji: string) => {
      const prefix = serverId ? `/servers/${serverId}` : '';
      const encodedEmoji = encodeURIComponent(emoji);
      return api.delete(`${prefix}/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`);
  }
};

export const searchApi = {
  searchMessages: (serverId: string, params: { q: string; channelId?: string; limit?: number; page?: number }) =>
    api.get(`/servers/${serverId}/search`, { params }),
};

export const webhookApi = {
  list: (serverId: string, channelId: string) => api.get(`/servers/${serverId}/channels/${channelId}/webhooks`),
  create: (serverId: string, channelId: string, data: { name: string; avatarUrl?: string }) => api.post(`/servers/${serverId}/channels/${channelId}/webhooks`, data),
  update: (serverId: string, channelId: string, webhookId: string, data: { name?: string; avatarUrl?: string }) => api.patch(`/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`, data),
  delete: (serverId: string, channelId: string, webhookId: string) => api.delete(`/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`),
};

export const uploadApi = {
    uploadFile: (channelId: string, formData: FormData, onUploadProgress?: (progressEvent: any) => void) => {
      // By letting Axios handle the FormData, it will automatically set the
      // correct 'Content-Type' header with the required boundary.
      // Manually setting it overrides this behavior and causes errors.
      return api.post(`/channels/${channelId}/uploads`, formData, {
        onUploadProgress,
      });
    },
  };

export default api;
