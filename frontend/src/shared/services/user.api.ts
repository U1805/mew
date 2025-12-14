import api from './http';

export const userApi = {
  search: (query: string) => api.get('/users/search', { params: { q: query } }),
  getById: (userId: string) => api.get(`/users/${userId}`),
  updateProfile: (data: FormData | { username: string }) => api.patch('/users/@me', data),
  changePassword: (data: { oldPassword, newPassword }) => api.post('/users/@me/password', data),
};

export default userApi;