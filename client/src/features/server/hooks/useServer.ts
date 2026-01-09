import { useQuery } from '@tanstack/react-query';
import { serverApi } from '../../../shared/services/api';
import { Server } from '../../../shared/types';

export const useServer = (serverId: string | null | undefined) => {
  return useQuery({
    queryKey: ['server', serverId],
    queryFn: async () => {
      if (!serverId) return null;
      const res = await serverApi.get(serverId);
      return res.data as Server;
    },
    enabled: !!serverId,
  });
};

export default useServer;

