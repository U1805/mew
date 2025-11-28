import React from 'react';
import { Icon } from '@iconify/react';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

const MessageActionMenu = ({ message, setIsEditing, setReplyingTo }) => {
  const { channelId } = useParams<{ channelId: string }>();
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;

    try {
      // Optimistically update the UI
      queryClient.setQueryData(['channels', channelId, 'messages'], (oldData: any) => {
        if (!oldData) return oldData;
        const newPages = oldData.pages.map(page => ({
          ...page,
          messages: page.messages.filter(m => m._id !== message._id),
        }));
        return { ...oldData, pages: newPages };
      });

      await api.delete(`/channels/${channelId}/messages/${message._id}`);
    } catch (error) {
      console.error('Failed to delete message:', error);
      // Revert on error
      queryClient.invalidateQueries({ queryKey: ['channels', channelId, 'messages'] });
    }
  };

  return (
    <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <div className="bg-gray-700 rounded-md shadow-lg flex items-center space-x-1 p-1">
        <button onClick={() => setIsEditing(true)} className="p-1 hover:bg-gray-600 rounded" aria-label="Edit">
          <Icon icon="mdi:pencil" className="w-5 h-5" />
        </button>
        <button onClick={handleDelete} className="p-1 hover:bg-gray-600 rounded" aria-label="Delete">
          <Icon icon="mdi:delete" className="w-5 h-5" />
        </button>
        <button onClick={() => setReplyingTo(message)} className="p-1 hover:bg-gray-600 rounded" aria-label="Reply">
          <Icon icon="mdi:reply" className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default MessageActionMenu;
