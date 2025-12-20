import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../stores';
import { Channel } from '../types';
import { useMemo } from 'react';

/**
 * A hook to get the effective permissions of the current user for a specific channel.
 *
 * It retrieves the channel list data from the React Query cache and finds the
 * permissions array for the given channel.
 *
 * @param channelId The ID of the channel to get permissions for.
 * @returns A Set containing the user's permission strings for that channel.
 */
export const usePermissions = (channelId: string): Set<string> => {
  const queryClient = useQueryClient();
  const { currentServerId } = useUIStore();

  const permissions = useMemo(() => {
    const channels: Channel[] | undefined = currentServerId
      ? queryClient.getQueryData(['channels', currentServerId])
      : queryClient.getQueryData(['dmChannels']);

    const channel = channels?.find(c => c._id === channelId);
    return new Set(channel?.permissions || []);
  }, [queryClient, currentServerId, channelId]);

  return permissions;
};
