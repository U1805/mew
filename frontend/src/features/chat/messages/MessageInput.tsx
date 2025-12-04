import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { messageApi } from '../../../shared/services/api';
import { Channel, Message } from '../../../shared/types';
import { useAuthStore } from '../../../shared/stores/store';

interface MessageInputProps {
  channel: Channel | null;
  serverId: string | null;
  channelId: string | null;
}

const MessageInput: React.FC<MessageInputProps> = ({ channel, serverId, channelId }) => {
  const [inputValue, setInputValue] = useState('');
  const queryClient = useQueryClient();

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !channelId) return;

    // For DM channels, serverId will be null so we pass it as undefined.
    const currentServerId = serverId ? serverId : undefined;

    // Optimistic update
    const tempId = new Date().toISOString(); // Temporary unique ID
    const user = useAuthStore.getState().user;

    if (!user) return; // Should not happen if they can send messages

    const newMessage: Message = {
      _id: tempId,
      channelId: channelId,
      authorId: {
        _id: user._id,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
      content: inputValue,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Update the cache optimistically
    queryClient.setQueryData(['messages', channelId], (oldData: Message[] | undefined) => {
      return oldData ? [...oldData, newMessage] : [newMessage];
    });

    setInputValue('');

    try {
      await messageApi.send(currentServerId, channelId, { content: inputValue });
      // On success, invalidate to refetch and get the real message from the server
      await queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
    } catch (err) {
      // On error, revert the optimistic update
      queryClient.setQueryData(['messages', channelId], (oldData: Message[] | undefined) => {
        return oldData ? oldData.filter(m => m._id !== tempId) : [];
      });
      console.error("Failed to send message:", err);
      // Optionally, restore the input value to allow the user to retry
      setInputValue(inputValue);
    }
  };

  return (
    <div className="px-4 pb-6 pt-2 flex-shrink-0">
      <form onSubmit={handleSendMessage} className="bg-[#383A40] rounded-lg p-2.5 flex items-center">
        <button type="button" className="text-mew-textMuted hover:text-mew-text p-1 mr-2 rounded-full hover:bg-mew-darker">
          <Icon icon="mdi:plus-circle" width="24" height="24" />
        </button>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={`Message #${channel?.name || 'channel'}`}
          className="bg-transparent flex-1 text-mew-text placeholder-mew-textMuted focus:outline-none"
        />
        <div className="flex items-center space-x-2 mr-2">
          <button type="button" className="text-mew-textMuted hover:text-mew-text"><Icon icon="mdi:gift" width="24" height="24" /></button>
          <button type="button" className="text-mew-textMuted hover:text-mew-text"><Icon icon="mdi:sticker-emoji" width="24" height="24" /></button>
          <button type="button" className="text-mew-textMuted hover:text-mew-text"><Icon icon="mdi:emoticon-happy" width="24" height="24" /></button>
        </div>
      </form>
    </div>
  );
};

export default MessageInput;