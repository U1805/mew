import api from './http';

export const userStickerApi = {
  listMine: () => api.get('/users/@me/stickers'),
  // Do NOT manually set Content-Type for FormData; the browser/axios will add the correct boundary.
  createMine: (data: FormData) => api.post('/users/@me/stickers', data),
  updateMine: (
    stickerId: string,
    data: { name?: string; description?: string | null; tags?: string[] | string }
  ) => api.patch(`/users/@me/stickers/${stickerId}`, data),
  removeMine: (stickerId: string) => api.delete(`/users/@me/stickers/${stickerId}`),
};

export default userStickerApi;

