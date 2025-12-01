import { useQuery } from '@tanstack/react-query';
import { messageApi } from '@/services/api';
import { Message } from '@/types';

export const useMessages = (serverId: string | null, channelId: string | null) => {
  return useQuery({
    queryKey: ['messages', channelId],
    queryFn: async () => {
      if (!serverId || !channelId) return [];
      const res = await messageApi.list(serverId, channelId);
      return (res.data as Message[]).sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    },
    enabled: !!serverId && !!channelId,
    refetchOnWindowFocus: false,
  });
};