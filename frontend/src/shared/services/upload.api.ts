import api from './http';

export const uploadApi = {
  uploadFile: (
    channelId: string,
    formData: FormData,
    onUploadProgress?: (progressEvent: any) => void
  ) =>
    api.post(`/channels/${channelId}/uploads`, formData, {
      onUploadProgress,
    }),
};

export default uploadApi;

