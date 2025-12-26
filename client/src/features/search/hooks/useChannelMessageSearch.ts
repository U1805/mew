import { useQuery } from '@tanstack/react-query';
import { searchApi } from '../../../shared/services/api';
import { Message } from '../../../shared/types';

export const useChannelMessageSearch = (
  channelId: string | null | undefined,
  searchQuery: string,
  enabled: boolean
) => {
  return useQuery({
    queryKey: ['channelMessageSearch', channelId, searchQuery],
    queryFn: async () => {
      if (!channelId || !searchQuery) return { messages: [], pagination: {} };
      const res = await searchApi.searchChannelMessages(channelId, { q: searchQuery });
      return res.data as { messages: Message[]; pagination: any };
    },
    enabled: enabled && !!channelId && !!searchQuery,
    staleTime: 1000 * 30,
  });
};

export default useChannelMessageSearch;

