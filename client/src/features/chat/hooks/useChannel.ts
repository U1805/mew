import { useQuery } from '@tanstack/react-query';
import { channelApi } from '../../../shared/services/api';
import { Channel } from '../../../shared/types';

export const useChannel = (
  serverId: string | null | undefined,
  channelId: string | null | undefined
) => {
  return useQuery({
    queryKey: ['channel', channelId],
    queryFn: async () => {
      if (!channelId) return null;
      if (serverId) {
        const res = await channelApi.list(serverId);
        return (res.data as Channel[]).find(c => c._id === channelId) || null;
      }
      const res = await channelApi.listDMs();
      return (res.data as Channel[]).find(c => c._id === channelId) || null;
    },
    enabled: !!channelId,
  });
};

export default useChannel;

