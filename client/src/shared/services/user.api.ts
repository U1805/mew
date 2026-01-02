import api from './http';

export const userApi = {
  search: (query: string) => api.get('/users/search', { params: { q: query } }),
  getById: (userId: string) => api.get(`/users/${userId}`),
  updateProfile: (data: FormData | { username: string }) => api.patch('/users/@me', data),
  changePassword: (data: { oldPassword, newPassword }) => api.post('/users/@me/password', data),
  getNotificationSettings: () => api.get('/users/@me/notification-settings'),
  updateNotificationSettings: (data: { soundEnabled?: boolean; soundVolume?: number; desktopEnabled?: boolean }) =>
    api.put('/users/@me/notification-settings', data),
};

export default userApi;
