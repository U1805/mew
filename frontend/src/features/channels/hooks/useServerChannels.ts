import { useQuery } from '@tanstack/react-query';
import { channelApi } from '../../../shared/services/api';
import { Channel } from '../../../shared/types';

export const useServerChannels = (serverId: string | null | undefined) => {
  return useQuery({
    queryKey: ['channels', serverId],
    queryFn: async () => {
      if (!serverId) return [];
      const res = await channelApi.list(serverId);
      return res.data as Channel[];
    },
    enabled: !!serverId,
  });
};

export default useServerChannels;

