import { useQuery } from '@tanstack/react-query';
import { userApi } from '../../../shared/services/api';
import { User } from '../../../shared/types';

export const useUserSearch = (query: string) => {
  return useQuery({
    queryKey: ['userSearch', query],
    queryFn: async () => {
      if (!query) return [];
      const res = await userApi.search(query);
      return res.data as User[];
    },
    enabled: !!query,
  });
};

export default useUserSearch;

