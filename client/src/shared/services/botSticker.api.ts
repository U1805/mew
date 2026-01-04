import api from './http';

export const botStickerApi = {
  list: (botId: string) => api.get(`/users/@me/bots/${botId}/stickers`),
  create: (botId: string, data: FormData) => api.post(`/users/@me/bots/${botId}/stickers`, data),
  update: (botId: string, stickerId: string, data: { name?: string; description?: string | null }) =>
    api.patch(`/users/@me/bots/${botId}/stickers/${stickerId}`, data),
  remove: (botId: string, stickerId: string) => api.delete(`/users/@me/bots/${botId}/stickers/${stickerId}`),
};

export default botStickerApi;
