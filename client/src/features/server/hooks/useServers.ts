import { useQuery } from '@tanstack/react-query';
import { serverApi } from '../../../shared/services/api';
import { Server } from '../../../shared/types';

export const useServers = () => {
  return useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const res = await serverApi.list();
      return res.data as Server[];
    },
  });
};

export default useServers;

