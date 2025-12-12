import api from './http';

export const userApi = {
  search: (query: string) => api.get('/users/search', { params: { q: query } }),
  getById: (userId: string) => api.get(`/users/${userId}`),
};

export default userApi;

