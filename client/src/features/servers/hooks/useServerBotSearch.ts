import { useQuery } from '@tanstack/react-query';
import { serverBotApi } from '../../../shared/services/api';
import { User } from '../../../shared/types';

export const useServerBotSearch = (serverId: string | null, query: string) => {
  return useQuery({
    queryKey: ['serverBotSearch', serverId, query],
    queryFn: async () => {
      if (!serverId || !query) return [];
      const res = await serverBotApi.search(serverId, query);
      return res.data as User[];
    },
    enabled: !!serverId && !!query,
  });
};

export default useServerBotSearch;

