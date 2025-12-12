import { useQuery } from '@tanstack/react-query';
import { webhookApi } from '../../../shared/services/api';
import { Webhook } from '../../../shared/types';

export const useWebhooks = (
  serverId: string | null | undefined,
  channelId: string | null | undefined
) => {
  return useQuery({
    queryKey: ['webhooks', channelId],
    queryFn: async () => {
      if (!serverId || !channelId) return [];
      const res = await webhookApi.list(serverId, channelId);
      return res.data as Webhook[];
    },
    enabled: !!serverId && !!channelId,
  });
};

export default useWebhooks;

