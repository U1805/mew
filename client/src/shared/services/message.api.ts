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
    data: { content?: string; attachments?: Attachment[] }
  ) => {
    const prefix = serverId ? `/servers/${serverId}` : '';
    return api.post(`${prefix}/channels/${channelId}/messages`, data);
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

