import { useQuery } from '@tanstack/react-query';
import { channelApi } from '../../../shared/services/api';
import { PermissionOverride } from '../../../shared/types';

export const usePermissionOverrides = (
  serverId: string | null | undefined,
  channelId: string | null | undefined
) => {
  return useQuery<PermissionOverride[]>({
    queryKey: ['permissionOverrides', channelId],
    queryFn: () => channelApi.getPermissionOverrides(serverId!, channelId!).then(res => res.data),
    enabled: !!serverId && !!channelId,
  });
};

export default usePermissionOverrides;

