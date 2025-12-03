
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/shared/services/socket';
import { Category } from '@/shared/types';

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
    

    socket.on('CATEGORY_UPDATE', handleCategoryUpdate);
    socket.on('CATEGORY_DELETE', handleCategoryDelete);
    
    return () => {
        socket.off('CATEGORY_UPDATE', handleCategoryUpdate);
        socket.off('CATEGORY_DELETE', handleCategoryDelete);
    };
  }, [serverId, queryClient]);
};
