import React, { useState } from 'react';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

const MessageEditor = ({ message, setIsEditing }) => {
  const { channelId } = useParams<{ channelId: string }>();
  const queryClient = useQueryClient();
  const [content, setContent] = useState(message.content);

  const handleSave = async (e) => {
    e.preventDefault();
    const newContent = content.trim();
    if (newContent === '' || newContent === message.content) {
      setIsEditing(false);
      return;
    }

    try {
      const updatedMessage = { ...message, content: newContent };

      // Optimistically update the UI
      queryClient.setQueryData(['channels', channelId, 'messages'], (oldData: any) => {
        if (!oldData) return oldData;
        const newPages = oldData.pages.map(page => ({
          ...page,
          messages: page.messages.map(m => m._id === message._id ? updatedMessage : m),
        }));
        return { ...oldData, pages: newPages };
      });

      setIsEditing(false);
      await api.patch(`/channels/${channelId}/messages/${message._id}`, { content: newContent });
    } catch (error) {
      console.error('Failed to edit message:', error);
      queryClient.invalidateQueries({ queryKey: ['channels', channelId, 'messages'] });
    }
  };

  return (
    <form onSubmit={handleSave}>
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full bg-gray-600 border-gray-500 rounded p-1 focus:ring-2 focus:ring-blue-500 outline-none"
        autoFocus
        onBlur={() => setIsEditing(false)} // Optional: cancel on blur
      />
      <div className="text-xs mt-1">Press Enter to save, Esc to cancel.</div>
    </form>
  );
};

export default MessageEditor;
