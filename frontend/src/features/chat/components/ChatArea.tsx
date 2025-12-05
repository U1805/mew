import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import MemberList from './MemberList';
import ChatHeader from './ChatHeader';
import MessageList from '../messages/MessageList';
import MessageInput from '../messages/MessageInput';
import { SearchResultsPanel } from '../../search/components/SearchResultsPanel';
import { Channel } from '../../../shared/types';
import { useUIStore } from '../../../shared/stores/store';
import { useSocketMessages } from '../../../shared/hooks/useSocketMessages';
import { useMessages } from '../../../shared/hooks/useMessages';
import { channelApi } from '../../../shared/services/api';

const ChatArea: React.FC = () => {
  const { currentServerId, currentChannelId, isMemberListOpen, toggleMemberList, isSearchOpen } = useUIStore();

  const { data: channel } = useQuery({
    queryKey: ['channel', currentChannelId],
    queryFn: async () => {
      if (!currentChannelId) return null;
      
      // Since we don't have a single getChannel endpoint in the API spec, 
      // we search within the relevant list based on context.
      if (currentServerId) {
          const res = await channelApi.list(currentServerId);
          return (res.data as Channel[]).find(c => c._id === currentChannelId) || null;
      } else {
          const res = await channelApi.listDMs();
          return (res.data as Channel[]).find(c => c._id === currentChannelId) || null;
      }
    },
    enabled: !!currentChannelId
  });

  const { data: messages = [], isLoading } = useMessages(currentServerId, currentChannelId);
  useSocketMessages(currentChannelId);

  if (!currentChannelId) {
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
      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <MessageList messages={messages} isLoading={isLoading} channel={channel || null} channelId={currentChannelId} />
          <MessageInput channel={channel || null} serverId={currentServerId} channelId={currentChannelId} />
        </div>
        {/* Search Results Panel - Overlays or sits next to content, but here using absolute positioning within the container managed by itself or container */}
        <SearchResultsPanel />
        
        {/* Only show member list for server channels */}
        {isMemberListOpen && currentServerId && <MemberList />}
      </div>
    </div>
  );
};

export default ChatArea;