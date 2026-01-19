import api from './http';
import { Attachment } from '../types';

export const messageApi = {
  list: (
    serverId: string | undefined,
    channelId: string,
    options?: { limit?: number; before?: string }
  ) => {
    const prefix = serverId ? `/servers/${serverId}` : '';
    return api.get(`${prefix}/channels/${channelId}/messages`, { params: options });
  },
  send: (
    serverId: string | undefined,
    channelId: string,
    data: {
      content?: string;
      plainText?: string;
      attachments?: Attachment[];
      referencedMessageId?: string;
      type?: string;
      payload?: any;
    }
  ) => {
    const prefix = serverId ? `/servers/${serverId}` : '';
    return api.post(`${prefix}/channels/${channelId}/messages`, data);
  },
  transcribeVoice: (
    serverId: string | undefined,
    channelId: string,
    messageId: string,
    file: File
  ) => {
    const prefix = serverId ? `/servers/${serverId}` : '';
    const form = new FormData();
    form.append('file', file);
    return api.post(`${prefix}/channels/${channelId}/messages/${messageId}/transcribe`, form, {
      responseType: 'text',
    });
  },
  update: (
    serverId: string | undefined,
    channelId: string,
    messageId: string,
    content: string
  ) => {
    const prefix = serverId ? `/servers/${serverId}` : '';
    return api.patch(`${prefix}/channels/${channelId}/messages/${messageId}`, { content });
  },
  delete: (
    serverId: string | undefined,
    channelId: string,
    messageId: string
  ) => {
    const prefix = serverId ? `/servers/${serverId}` : '';
    return api.delete(`${prefix}/channels/${channelId}/messages/${messageId}`);
  },
  addReaction: (
    serverId: string | undefined,
    channelId: string,
    messageId: string,
    emoji: string
  ) => {
    const prefix = serverId ? `/servers/${serverId}` : '';
    const encodedEmoji = encodeURIComponent(emoji);
    return api.put(
      `${prefix}/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`
    );
  },
  removeReaction: (
    serverId: string | undefined,
    channelId: string,
    messageId: string,
    emoji: string
  ) => {
    const prefix = serverId ? `/servers/${serverId}` : '';
    const encodedEmoji = encodeURIComponent(emoji);
    return api.delete(
      `${prefix}/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`
    );
  },
};

export default messageApi;

