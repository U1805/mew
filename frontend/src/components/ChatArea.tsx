import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { messageApi } from '../services/api';
import { useUIStore } from '../store';
import { getSocket } from '../services/socket';
import { Message, Channel } from '../types';
import MessageItem from './MessageItem';
import MemberList from './MemberList';
import { Icon } from '@iconify/react';
import clsx from 'clsx';

const ChatArea: React.FC = () => {
  const { currentServerId, currentChannelId, isMemberListOpen, toggleMemberList } = useUIStore();
  // const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  
  // Fetch Channel Details
  const { data: channel } = useQuery({
      queryKey: ['channel', currentChannelId],
      queryFn: async () => {
          if (!currentChannelId || !currentServerId) return null;
          return { _id: currentChannelId, name: 'general', type: 'GUILD_TEXT' } as Channel;
      },
      enabled: !!currentChannelId
  });

  // Fetch Messages
  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', currentChannelId],
    queryFn: async () => {
      if (!currentServerId || !currentChannelId) return [];
      const res = await messageApi.list(currentServerId, currentChannelId);
      // Sort messages by creation time (Oldest -> Newest)
      // Backend returns Descending (Newest -> Oldest) for pagination purposes
      return (res.data as Message[]).sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    },
    enabled: !!currentServerId && !!currentChannelId,
    refetchOnWindowFocus: false,
  });

  // Socket Listener for Create, Update, Delete
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !currentChannelId) return;

    const handleNewMessage = (newMessage: Message) => {
      if (newMessage.channelId === currentChannelId) {
        queryClient.setQueryData(['messages', currentChannelId], (old: Message[] | undefined) => {
            if (!old) return [newMessage];
            if (old.find(m => m._id === newMessage._id)) return old;
            return [...old, newMessage];
        });
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    };

    const handleUpdateMessage = (updatedMessage: Message) => {
        if (updatedMessage.channelId === currentChannelId) {
            queryClient.setQueryData(['messages', currentChannelId], (old: Message[] | undefined) => {
                if (!old) return old;
                return old.map(m => m._id === updatedMessage._id ? updatedMessage : m);
            });
        }
    };

    const handleDeleteMessage = ({ messageId, channelId }: { messageId: string, channelId: string }) => {
        if (channelId === currentChannelId) {
            queryClient.setQueryData(['messages', currentChannelId], (old: Message[] | undefined) => {
                if (!old) return old;
                return old.filter(m => m._id !== messageId);
            });
        }
    }

    // UPDATED: Event names matching backend SCREAMING_SNAKE_CASE
    socket.on('MESSAGE_CREATE', handleNewMessage);
    socket.on('MESSAGE_UPDATE', handleUpdateMessage);
    socket.on('MESSAGE_DELETE', handleDeleteMessage);

    return () => {
      socket.off('MESSAGE_CREATE', handleNewMessage);
      socket.off('MESSAGE_UPDATE', handleUpdateMessage);
      socket.off('MESSAGE_DELETE', handleDeleteMessage);
    };
  }, [currentChannelId, queryClient]);

  // Scroll to bottom on load
  useEffect(() => {
      if (messages) {
          bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      }
  }, [currentChannelId, messages?.length]); 

  const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || !currentServerId || !currentChannelId) return;
      
      try {
          await messageApi.send(currentServerId, currentChannelId, { content: inputValue });
          setInputValue('');
          // UPDATED: Invalidate queries to ensure data consistency
          await queryClient.invalidateQueries({ queryKey: ['messages', currentChannelId] });
      } catch (err) {
          console.error("Failed to send", err);
      }
  };

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
      {/* Header */}
      <div className="h-12 border-b border-mew-darkest flex items-center px-4 shadow-sm flex-shrink-0 bg-mew-dark">
        <Icon icon="mdi:pound" className="text-mew-textMuted mr-2" width="24" height="24" />
        <span className="font-bold text-white mr-2">{channel?.name || 'channel'}</span>
        <span className="text-xs text-mew-textMuted border-l border-mew-textMuted pl-2 ml-2 hidden md:block truncate">
            Welcome to the beginning of the #{channel?.name || 'channel'} channel.
        </span>
        <div className="ml-auto flex items-center space-x-4 text-mew-textMuted">
            <Icon icon="mdi:bell" className="hover:text-mew-text cursor-pointer hidden sm:block" />
            <Icon icon="mdi:pin" className="hover:text-mew-text cursor-pointer hidden sm:block" />
            
            {/* Toggle Member List */}
            <Icon 
                icon="mdi:account-group" 
                className={clsx("hover:text-mew-text cursor-pointer transition-colors", isMemberListOpen && "text-white")} 
                onClick={toggleMemberList}
            />
            
            <div className="relative hidden lg:block">
                <input type="text" placeholder="Search" className="bg-mew-darker text-sm rounded px-2 py-0.5 w-36 transition-all focus:w-60 focus:outline-none text-mew-text" />
                <Icon icon="mdi:magnify" className="absolute right-1 top-1 text-xs" />
            </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Chat Content */}
        <div className="flex flex-col flex-1 min-w-0">
            <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col custom-scrollbar">
                {!isLoading && messages ? (
                    <div className="flex flex-col justify-end min-h-0">
                        <div className="mt-auto flex flex-col pb-4">
                            {/* Welcome Message */}
                            <div className="p-4 mt-4 mb-4 border-b border-[#3F4147]">
                                <div className="w-16 h-16 bg-mew-darker rounded-full flex items-center justify-center mb-4">
                                    <Icon icon="mdi:pound" width="40" height="40" className="text-white" />
                                </div>
                                <h1 className="text-3xl font-bold text-white mb-2">Welcome to #{channel?.name || 'channel'}!</h1>
                                <p className="text-mew-textMuted">This is the start of the #{channel?.name || 'channel'} channel.</p>
                            </div>
                            
                            {messages.map((msg, index) => {
                                const prevMsg = messages[index - 1];
                                const isSequential = prevMsg && 
                                                    prevMsg.authorId === msg.authorId && 
                                                    (new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() < 5 * 60 * 1000);
                                
                                return <MessageItem key={msg._id} message={msg} isSequential={!!isSequential} />;
                            })}
                        </div>
                        <div ref={bottomRef} />
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <Icon icon="mdi:loading" className="animate-spin text-mew-textMuted" width="32" height="32" />
                    </div>
                )}
            </div>

            {/* Input Area */}
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
        </div>
        
        {/* Right Sidebar: Member List */}
        {isMemberListOpen && <MemberList />}
      </div>
    </div>
  );
};

export default ChatArea;