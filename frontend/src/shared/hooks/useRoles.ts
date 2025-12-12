import { useQuery } from '@tanstack/react-query';
import { roleApi } from '../services/api';
import { Role } from '../types';

export const useRoles = (serverId: string | null | undefined) => {
  return useQuery<Role[], Error>({
    queryKey: ['roles', serverId],
    queryFn: () => roleApi.list(serverId!).then(res => res.data),
    enabled: !!serverId,
    staleTime: 1000 * 60 * 5,
  });
};

export default useRoles;

