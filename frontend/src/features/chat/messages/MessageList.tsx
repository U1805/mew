import React, { useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import MessageItem from './MessageItem';
import { Message, Channel, ChannelType } from '../../../shared/types';
import { useAuthStore, useUIStore } from '../../../shared/stores/store';
import { channelApi } from '../../../shared/services/api';
import { useQueryClient } from '@tanstack/react-query';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  channel: Channel | null;
  channelId: string | null;
}

const MessageList: React.FC<MessageListProps> = ({ messages, isLoading, channel, channelId }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { currentServerId, targetMessageId, setTargetMessageId } = useUIStore();

  // Effect for Auto-Scroll to Bottom (Standard Chat Behavior)
  // We only scroll to bottom if we are NOT trying to jump to a specific message history.
  useEffect(() => {
    // If we have a target message pending, don't auto-scroll to bottom.
    // We check state directly to ensure fresh value, though dependency array handles updates.
    if (useUIStore.getState().targetMessageId) return;

    if (messages && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [channelId, messages?.length]); // Only run on channel change or new message

  // Effect for Jump to Message (Search Results)
  useEffect(() => {
    if (targetMessageId && messages && !isLoading) {
        const el = document.getElementById(`message-${targetMessageId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Add a temporary highlight flash
            el.classList.add('bg-mew-accent/20');
            setTimeout(() => {
                el.classList.remove('bg-mew-accent/20');
                // Clear target so future channel switches scroll to bottom again
                setTargetMessageId(null);
            }, 2000);
        }
    }
  }, [targetMessageId, messages, isLoading, setTargetMessageId]);

  // Acknowledge channel once messages are loaded
  useEffect(() => {
    if (channel && channelId && messages.length > 0 && !isLoading) {
      const lastMessage = messages[messages.length - 1];

      if (lastMessage._id !== channel.lastReadMessageId) {
        channelApi.ack(channelId, lastMessage._id)
          .then(() => {
            // Invalidate queries to refetch channel lists with updated read state
            queryClient.invalidateQueries({ queryKey: ['dmChannels']});
            if (currentServerId) {
              queryClient.invalidateQueries({ queryKey: ['channels', currentServerId] });
            }
          })
          .catch(err => {
            console.error("Failed to acknowledge channel:", err);
          });
      }
    }
  }, [messages, channel, channelId, isLoading, queryClient, currentServerId]);

  const isDM = channel?.type === ChannelType.DM;
  let otherUser: any = null;
  if (isDM && channel?.recipients) {
     otherUser = channel.recipients.find((r: any) => r._id !== user?._id);
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col custom-scrollbar">
      {!isLoading && messages ? (
        <div className="flex flex-col mt-auto">
          <div className="flex flex-col pb-4">
            <div className="p-4 mt-4 mb-4 border-b border-[#3F4147]">
              {isDM && otherUser ? (
                  <>
                    <div className="w-[80px] h-[80px] rounded-full bg-mew-accent flex items-center justify-center mb-4 overflow-hidden">
                        {otherUser.avatarUrl ? (
                             <img src={otherUser.avatarUrl} alt={otherUser.username} className="w-full h-full object-cover" />
                        ) : (
                             <span className="text-3xl font-bold text-white">{otherUser.username.substring(0, 2).toUpperCase()}</span>
                        )}
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">{otherUser.username}</h1>
                    <p className="text-mew-textMuted">This is the beginning of your direct message history with <span className="font-semibold text-white">@{otherUser.username}</span>.</p>
                  </>
              ) : (
                  <>
                    <div className="w-16 h-16 bg-mew-darker rounded-full flex items-center justify-center mb-4">
                        <Icon icon="mdi:pound" width="40" height="40" className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Welcome to #{channel?.name || 'channel'}!</h1>
                    <p className="text-mew-textMuted">This is the start of the #{channel?.name || 'channel'} channel.</p>
                  </>
              )}
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
  );
};

export default MessageList;