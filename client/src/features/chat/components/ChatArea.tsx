import React from 'react';
import { Icon } from '@iconify/react';
import MemberList from './MemberList';
import ChatHeader from './ChatHeader';
import MessageList from '../messages/MessageList';
import MessageInput from '../messages/MessageInput';
import { SearchResultsPanel } from '../../search/components/SearchResultsPanel';
import { DmSearchResultsPanel } from '../../search/components/DmSearchResultsPanel';
import { useUIStore } from '../../../shared/stores';
import { useSocketMessages } from '../../../shared/hooks/useSocketMessages';
import { useMessages } from '../../../shared/hooks/useMessages';
import { useChannel } from '../hooks/useChannel';
import { ChannelType } from '../../../shared/types';

const ChatArea: React.FC = () => {
  const { currentServerId, currentChannelId, isMemberListOpen, toggleMemberList } = useUIStore();

  const { data: channel } = useChannel(currentServerId, currentChannelId);
  const isDM = channel?.type === ChannelType.DM;

  const {
    data: messages = [],
    isLoading,
    fetchOlder,
    isFetchingOlder,
    hasMoreOlder,
  } = useMessages(currentServerId, currentChannelId);
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
          <MessageList
            messages={messages}
            isLoading={isLoading}
            isFetchingOlder={isFetchingOlder}
            hasMoreOlder={hasMoreOlder}
            onLoadOlder={fetchOlder}
            channel={channel || null}
            channelId={currentChannelId}
          />
          <MessageInput channel={channel || null} serverId={currentServerId} channelId={currentChannelId} />
        </div>
        {/* Search Results Panel - Overlays or sits next to content, but here using absolute positioning within the container managed by itself or container */}
        <SearchResultsPanel />
        {isDM && <DmSearchResultsPanel />}
        
        {/* Only show member list for server channels */}
        {isMemberListOpen && currentServerId && <MemberList />}
      </div>
    </div>
  );
};

export default ChatArea;
