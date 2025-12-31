import React from 'react';
import { Icon } from '@iconify/react';
import MemberList from './MemberList';
import ChatHeader from './ChatHeader';
import MessageList from '../../chat-messages/components/MessageList';
import MessageInput from '../../chat-messages/components/MessageInput';
import { SearchResultsPanel } from '../../search/components/SearchResultsPanel';
import { DmSearchResultsPanel } from '../../search/components/DmSearchResultsPanel';
import { useUIStore } from '../../../shared/stores';
import { useSocketMessages } from '../../../shared/hooks/useSocketMessages';
import { useMessages } from '../../../shared/hooks/useMessages';
import { useChannel } from '../hooks/useChannel';
import { ChannelType } from '../../../shared/types';

const ChatArea: React.FC = () => {
  const { 
    currentServerId, 
    currentChannelId, 
    isMemberListOpen, 
    toggleMemberList,
    toggleMobileSidebar
  } = useUIStore();

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

  // --- 空状态处理 (未选择频道) ---
  if (!currentChannelId) {
    return (
      <div className="flex-1 bg-mew-dark flex items-center justify-center flex-col text-mew-textMuted h-full relative">
        
        {/* 
          新增：移动端左上角的汉堡菜单 
          让用户在空状态下也能唤出侧边栏
        */}
        <div className="absolute top-0 left-0 w-full h-12 flex items-center px-4 md:hidden z-10">
          <button 
            onClick={() => toggleMobileSidebar(true)}
            className="text-mew-textMuted hover:text-white p-2 -ml-2 active:scale-90 transition-transform rounded-full hover:bg-mew-darker/50"
          >
            <Icon icon="mdi:menu" width="28" height="28" />
          </button>
        </div>

        <div className="w-16 h-16 bg-mew-darker rounded-full flex items-center justify-center mb-4">
             <Icon icon="mdi:chat-outline" width="32" height="32" />
        </div>
        <p className="mb-6">Select a channel to start chatting</p>
      </div>
    );
  }

  // --- 正常聊天界面 ---
  return (
    <div className="flex-1 bg-mew-dark flex flex-col min-w-0 h-full relative overflow-hidden">
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
        
        <SearchResultsPanel />
        {isDM && <DmSearchResultsPanel />}
        
        {/* Always render MemberList, it handles its own visibility/animation */}
        {currentServerId && <MemberList />}
      </div>
    </div>
  );
};

export default ChatArea;
