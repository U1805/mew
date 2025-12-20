import { useMemo } from 'react';
import { useQueries, UseQueryResult } from '@tanstack/react-query';
import { Channel, Server } from '../../../shared/types';
import { channelApi } from '../../../shared/services/api';
import { useServers } from './useServers';

export const useServersWithChannels = () => {
  const serversQuery = useServers();
  const servers = serversQuery.data;

  const queries = useMemo(
    () =>
      (servers || []).map((server: Server) => ({
        queryKey: ['channels', server._id],
        queryFn: async () => {
          const res = await channelApi.list(server._id);
          return res.data as Channel[];
        },
        staleTime: 5 * 60 * 1000,
      })),
    [servers]
  );

  const channelQueries = useQueries({ queries }) as unknown as UseQueryResult<Channel[], Error>[];

  return { serversQuery, servers, channelQueries };
};

export default useServersWithChannels;

