import api from './http';

export const botApi = {
  list: () => api.get('/users/@me/bots'),
  create: (data: FormData) => api.post('/users/@me/bots', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (botId: string, data: FormData) => api.patch(`/users/@me/bots/${botId}`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (botId: string) => api.delete(`/users/@me/bots/${botId}`),
  regenerateToken: (botId: string) => api.post(`/users/@me/bots/${botId}/token`),
};

export default botApi;