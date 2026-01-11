import { useQuery } from '@tanstack/react-query';
import { categoryApi } from '../../../shared/services/api';
import { Category } from '../../../shared/types';

export const useCategories = (serverId: string | null | undefined) => {
  return useQuery({
    queryKey: ['categories', serverId],
    queryFn: async () => {
      if (!serverId) return [];
      const res = await categoryApi.list(serverId);
      return res.data as Category[];
    },
    enabled: !!serverId,
  });
};

export default useCategories;

