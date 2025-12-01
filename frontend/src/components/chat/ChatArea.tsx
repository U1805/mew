import React from 'react';
import { useUIStore } from '../../store';
import MemberList from './MemberList';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { useMessages } from '../../hooks/useMessages';
import { useSocketMessages } from '../../hooks/useSocketMessages';
import { useQuery } from '@tanstack/react-query';
import { Channel } from '../../types';
import { Icon } from '@iconify/react';

const ChatArea: React.FC = () => {
  const { currentServerId, currentChannelId, isMemberListOpen, toggleMemberList } = useUIStore();

  const { data: channel } = useQuery({
    queryKey: ['channel', currentChannelId],
    queryFn: async () => {
      if (!currentChannelId || !currentServerId) return null;
      // This is a placeholder, in a real app you'd fetch this from an API
      return { _id: currentChannelId, name: 'general', type: 'GUILD_TEXT' } as Channel;
    },
    enabled: !!currentChannelId
  });

  const { data: messages = [], isLoading } = useMessages(currentServerId, currentChannelId);
  useSocketMessages(currentChannelId);

  if (!currentChannelId || !currentServerId) {
    return (
      <div className="flex-1 bg-mew-dark flex items-center justify-center flex-col text-mew-textMuted">
        <div className="w-16 h-16 bg-mew-darker rounded-full flex items-center justify-center mb-4">
             <Icon icon="mdi:chat-outline" width="32" height="32" />
        </div>
        <p>Select a channel to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-mew-dark flex flex-col min-w-0 h-full">
      <ChatHeader channel={channel || null} isMemberListOpen={isMemberListOpen} toggleMemberList={toggleMemberList} />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0">
          <MessageList messages={messages} isLoading={isLoading} channel={channel || null} channelId={currentChannelId} />
          <MessageInput channel={channel || null} serverId={currentServerId} channelId={currentChannelId} />
        </div>
        {isMemberListOpen && <MemberList />}
      </div>
    </div>
  );
};

export default ChatArea;