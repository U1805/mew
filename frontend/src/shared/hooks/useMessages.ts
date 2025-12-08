import { useQuery } from '@tanstack/react-query';
import { messageApi } from '../services/api';
import { Message } from '../types';

export const useMessages = (serverId: string | null, channelId: string | null) => {
  return useQuery({
    queryKey: ['messages', channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const currentServerId = serverId ? serverId : undefined;
      const res = await messageApi.list(currentServerId, channelId);
      return (res.data as Message[]).sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    },
    enabled: !!channelId,
    refetchOnWindowFocus: false,
  });
};