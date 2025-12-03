import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { messageApi } from '../../../shared/services/api';
import { Icon } from '@iconify/react';
import { Channel } from '../../../shared/types/index';

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
    if (!inputValue.trim() || !serverId || !channelId) return;

    try {
      await messageApi.send(serverId, channelId, { content: inputValue });
      setInputValue('');
      await queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
    } catch (err) {
      console.error("Failed to send", err);
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