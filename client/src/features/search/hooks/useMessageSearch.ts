import { useQuery } from '@tanstack/react-query';
import { searchApi } from '../../../shared/services/api';
import { Message } from '../../../shared/types';

export const useMessageSearch = (
  serverId: string | null | undefined,
  searchQuery: string,
  enabled: boolean
) => {
  return useQuery({
    queryKey: ['messageSearch', serverId, searchQuery],
    queryFn: async () => {
      if (!serverId || !searchQuery) return { messages: [], pagination: {} };
      const res = await searchApi.searchMessages(serverId, { q: searchQuery });
      return res.data as { messages: Message[]; pagination: any };
    },
    enabled: enabled && !!serverId && !!searchQuery,
    staleTime: 1000 * 60,
  });
};

export default useMessageSearch;

