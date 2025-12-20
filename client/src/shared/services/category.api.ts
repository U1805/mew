import api from './http';

export const categoryApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/categories`),
  create: (serverId: string, data: { name: string }) =>
    api.post(`/servers/${serverId}/categories`, data),
  update: (categoryId: string, data: { name?: string; position?: number }) =>
    api.patch(`/categories/${categoryId}`, data),
  delete: (categoryId: string) => api.delete(`/categories/${categoryId}`),
};

export default categoryApi;

