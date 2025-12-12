import { useQuery } from '@tanstack/react-query';
import { userApi } from '../../../shared/services/api';
import { User } from '../../../shared/types';

export const useUser = (userId: string | null | undefined, initialData?: User) => {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await userApi.getById(userId);
      return res.data as User;
    },
    enabled: !!userId,
    initialData,
  });
};

export default useUser;

