import { useQuery } from '@tanstack/react-query';
import { channelApi } from '../../../shared/services/api';
import { Channel } from '../../../shared/types';

export const useDmChannels = () => {
  return useQuery({
    queryKey: ['dmChannels'],
    queryFn: async () => {
      try {
        const res = await channelApi.listDMs();
        return res.data as Channel[];
      } catch {
        return [];
      }
    },
    enabled: true,
  });
};

export default useDmChannels;

