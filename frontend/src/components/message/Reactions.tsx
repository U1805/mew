import React, { useState } from 'react';
import { Icon } from '@iconify/react';
import EmojiPicker from 'emoji-picker-react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const Reactions = ({ message }) => {
  const { channelId } = useParams<{ channelId: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [isPickerOpen, setPickerOpen] = useState(false);

  const handleReaction = async (emoji: string) => {
    const queryKey = ['channels', channelId, 'messages'];
    const existingReaction = message.reactions?.find(r => r.emoji === emoji);
    const userHasReacted = existingReaction?.userIds.includes(user!._id);

    // Optimistic update
    queryClient.setQueryData(queryKey, (oldData: any) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map(page => ({
          ...page,
          messages: page.messages.map(m => {
            if (m._id !== message._id) return m;
            let newReactions;
            if (userHasReacted) {
              // Remove reaction
              newReactions = m.reactions.map(r => {
                  if (r.emoji === emoji) {
                      const newUserIds = r.userIds.filter(id => id !== user._id);
                      return newUserIds.length > 0 ? { ...r, userIds: newUserIds } : null;
                  }
                  return r;
              }).filter(Boolean);
            } else {
              // Add reaction
              const reactionExists = m.reactions.some(r => r.emoji === emoji);
              if (reactionExists) {
                  newReactions = m.reactions.map(r => {
                      if (r.emoji === emoji) {
                          return { ...r, userIds: [...r.userIds, user._id] };
                      }
                      return r;
                  });
              } else {
                  newReactions = [...m.reactions, { emoji, userIds: [user._id] }];
              }
            }
            return { ...m, reactions: newReactions };
          }),
        })),
      };
    });

    setPickerOpen(false);

    try {
      if (userHasReacted) {
        await api.delete(`/channels/${channelId}/messages/${message._id}/reactions/${encodeURIComponent(emoji)}/@me`);
      } else {
        await api.put(`/channels/${channelId}/messages/${message._id}/reactions/${encodeURIComponent(emoji)}/@me`);
      }
    } catch (error) {
      console.error('Failed to update reaction:', error);
      queryClient.invalidateQueries({ queryKey });
    }
  };

  return (
    <div className="mt-1 flex items-center space-x-2 relative">
      {message.reactions?.map(({ emoji, userIds }) => (
        <div
          key={emoji}
          onClick={() => handleReaction(emoji)}
          className={`bg-gray-700 hover:bg-gray-600 rounded-full px-2 py-1 flex items-center space-x-1 cursor-pointer ${userIds.includes(user!._id) ? 'border-2 border-blue-500' : ''}`}>
          <span>{emoji}</span>
          <span className="text-xs font-bold">{userIds.length}</span>
        </div>
      ))}
      <button
        onClick={() => setPickerOpen(!isPickerOpen)}
        className="bg-gray-700 hover:bg-gray-600 rounded-full p-1"
        aria-label="Add Reaction"
        >
        <Icon icon="mdi:emoticon-plus-outline" className="w-5 h-5" />
      </button>
      {isPickerOpen && (
        <div className="absolute bottom-full mb-2 z-10">
            <EmojiPicker onEmojiClick={(e) => handleReaction(e.emoji)} />
        </div>
      )}
    </div>
  );
};

export default Reactions;
