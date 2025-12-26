import api from './http';
import axios from 'axios';

type PresignResponse = {
  key: string;
  url: string;
  method: 'PUT';
  headers?: Record<string, string>;
  expiresInSeconds?: number;
};

export const uploadApi = {
  presignFile: (channelId: string, input: { filename: string; contentType?: string; size: number }) =>
    api.post<PresignResponse>(`/channels/${channelId}/uploads/presign`, input),
  uploadFile: (
    channelId: string,
    formData: FormData,
    onUploadProgress?: (progressEvent: any) => void
  ) =>
    api.post(`/channels/${channelId}/uploads`, formData, {
      onUploadProgress,
    }),

  uploadFileSmart: async (
    channelId: string,
    file: File,
    onUploadProgress?: (progressEvent: any) => void
  ) => {
    try {
      const presign = await uploadApi.presignFile(channelId, {
        filename: file.name || 'upload',
        contentType: file.type || undefined,
        size: file.size,
      });

      const { url, key, headers } = presign.data;
      await axios.put(url, file, {
        headers: {
          ...(headers || {}),
          ...(file.type ? { 'Content-Type': file.type } : {}),
        },
        onUploadProgress,
      });

      return {
        filename: file.name || 'upload',
        contentType: file.type || 'application/octet-stream',
        key,
        size: file.size,
      };
    } catch {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadApi.uploadFile(channelId, formData, onUploadProgress);
      return res.data as any;
    }
  },
};

export default uploadApi;

