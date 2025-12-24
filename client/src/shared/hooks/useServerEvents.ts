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
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] });
    };
    

    const handlePermissionsUpdate = (data: { serverId: string, channelId?: string }) => {
      if (data.serverId !== serverId) return;
      console.log('PERMISSIONS_UPDATE received', data);

      queryClient.invalidateQueries({ queryKey: ['roles', serverId] });
      queryClient.invalidateQueries({ queryKey: ['members', serverId] });
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] });

      if (data.channelId) {
        queryClient.invalidateQueries({ queryKey: ['permissionOverrides', data.channelId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['permissionOverrides'] });
      }
    };

    const handleMemberJoin = (data: { serverId: string; userId: string }) => {
      if (data.serverId !== serverId) return;
      queryClient.invalidateQueries({ queryKey: ['members', serverId] });
    };

    const handleMemberLeave = (data: { serverId: string; userId: string }) => {
      if (data.serverId !== serverId) return;
      queryClient.invalidateQueries({ queryKey: ['members', serverId] });
    };

    socket.on('CATEGORY_UPDATE', handleCategoryUpdate);
    socket.on('CATEGORY_DELETE', handleCategoryDelete);
    socket.on('PERMISSIONS_UPDATE', handlePermissionsUpdate);
    socket.on('MEMBER_JOIN', handleMemberJoin);
    socket.on('MEMBER_LEAVE', handleMemberLeave);

    return () => {
      socket.off('CATEGORY_UPDATE', handleCategoryUpdate);
      socket.off('CATEGORY_DELETE', handleCategoryDelete);
      socket.off('PERMISSIONS_UPDATE', handlePermissionsUpdate);
      socket.off('MEMBER_JOIN', handleMemberJoin);
      socket.off('MEMBER_LEAVE', handleMemberLeave);
    };
  }, [serverId, queryClient]);
};
