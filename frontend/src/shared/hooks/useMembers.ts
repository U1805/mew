import { useQuery } from '@tanstack/react-query';
import { memberApi } from '../services/api';
import { ServerMember } from '../types';

export const useMembers = (serverId: string | null) => {
  return useQuery<ServerMember[], Error>({
    queryKey: ['members', serverId],
    queryFn: () => memberApi.list(serverId!).then(res => res.data),
    enabled: !!serverId, // Only run the query if a serverId is present
    staleTime: 1000 * 60 * 5, // Cache members for 5 minutes
  });
};