import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { Category } from '../types';

export const useServerEvents = (serverId: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !serverId) return;

    const handleCategoryUpdate = (category: Category) => {
        if (category.serverId !== serverId) return;
        queryClient.setQueryData(['categories', serverId], (old: Category[] | undefined) => {
            if (!old) return old;
            return old.map(c => c._id === category._id ? category : c);
        });
    };

    const handleCategoryDelete = ({ categoryId }: { categoryId: string }) => {
        queryClient.setQueryData(['categories', serverId], (old: Category[] | undefined) => {
            if (!old) return old;
            return old.filter(c => c._id !== categoryId);
        });
        // Invalidate channels to reflect any that were moved to 'uncategorized'
        queryClient.invalidateQueries({ queryKey: ['channels', serverId] });
    };
    

    const handlePermissionsUpdate = (data: { serverId: string, channelId?: string }) => {
      if (data.serverId !== serverId) return;
      console.log('PERMISSIONS_UPDATE received', data);

      // Invalidate all queries that depend on permissions
      queryClient.invalidateQueries({ queryKey: ['roles', serverId] });
      queryClient.invalidateQueries({ queryKey: ['members', serverId] });
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] });

      // If a specific channel was affected, invalidate its overrides too
      // Otherwise, we might need a more broad invalidation strategy if many channels are affected
      if (data.channelId) {
        queryClient.invalidateQueries({ queryKey: ['permissionOverrides', data.channelId] });
      } else {
        // If no channelId is specified, it implies a server-wide change (e.g., role update).
        // Invalidate all override queries for this server.
        queryClient.invalidateQueries({ queryKey: ['permissionOverrides'] });
      }
    };

    socket.on('CATEGORY_UPDATE', handleCategoryUpdate);
    socket.on('CATEGORY_DELETE', handleCategoryDelete);
    socket.on('PERMISSIONS_UPDATE', handlePermissionsUpdate);

    return () => {
        socket.off('CATEGORY_UPDATE', handleCategoryUpdate);
        socket.off('CATEGORY_DELETE', handleCategoryDelete);
        socket.off('PERMISSIONS_UPDATE', handlePermissionsUpdate);
    };
  }, [serverId, queryClient]);
};
