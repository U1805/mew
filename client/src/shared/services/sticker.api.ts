import api from './http';

export const stickerApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/stickers`),
  // Do NOT manually set Content-Type for FormData; the browser/axios will add the correct boundary.
  create: (serverId: string, data: FormData) => api.post(`/servers/${serverId}/stickers`, data),
  update: (
    serverId: string,
    stickerId: string,
    data: { name?: string; description?: string | null; tags?: string[] | string }
  ) => api.patch(`/servers/${serverId}/stickers/${stickerId}`, data),
  remove: (serverId: string, stickerId: string) => api.delete(`/servers/${serverId}/stickers/${stickerId}`),
};

export default stickerApi;
