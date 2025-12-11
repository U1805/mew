import React, { useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import MessageItem from './MessageItem';
import TimestampDivider from './TimestampDivider';
import { formatDividerTimestamp } from '../../../shared/utils/date';
import { isSameDay } from 'date-fns';
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

  // [新增] 用于打破死循环的 Ref。记录本地已提交 ACK 的消息 ID
  const lastAckedMessageIdRef = useRef<string | null>(null);

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

      // [核心修复 1]: 使用正则严格验证是否为 MongoDB ObjectId (24位 0-9 a-f 字符)
      // 避免误判 ISO 时间戳 (也是24位)
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(lastMessage._id);

      // [核心修复 2]: 死循环熔断机制
      // 如果这个 ID 我们刚刚已经 ACK 过了，就不要再请求了
      const alreadyAckedLocally = lastAckedMessageIdRef.current === lastMessage._id;

      // 检查服务端状态
      const serverNeedsAck = lastMessage._id !== channel.lastReadMessageId;

      if (isValidObjectId && !alreadyAckedLocally && serverNeedsAck) {
        // 立即标记为已处理，防止在 API 返回前再次触发
        lastAckedMessageIdRef.current = lastMessage._id;

        channelApi.ack(channelId, lastMessage._id)
          .then(() => {
            // [修复] 使用 setQueryData 手动更新缓存，取代 invalidateQueries 以避免循环
            const updateChannelCache = (channel: Channel) => {
                if (channel._id === channelId) {
                    return { ...channel, lastReadMessageId: lastMessage._id };
                }
                return channel;
            };

            queryClient.setQueryData<Channel[]>(['dmChannels'], (oldData) =>
                oldData ? oldData.map(updateChannelCache) : []
            );

            if (currentServerId) {
                queryClient.setQueryData<Channel[]>(['channels', currentServerId], (oldData) =>
                    oldData ? oldData.map(updateChannelCache) : []
                );
            }
          })
          .catch(err => {
            console.warn("ACK failed, resetting local lock", err);
            // 失败时重置锁，允许下次重试
            lastAckedMessageIdRef.current = null;
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

              const currentTimestamp = new Date(msg.createdAt);
              const prevTimestamp = prevMsg ? new Date(prevMsg.createdAt) : null;

              let showDivider = false;
              if (prevTimestamp) {
                // Show if it's not the same day or if the time gap is larger than 1 minute
                if (!isSameDay(currentTimestamp, prevTimestamp) || (currentTimestamp.getTime() - prevTimestamp.getTime() > 5 * 60 * 1000)) {
                    showDivider = true;
                }
              }

              const isSequential = prevMsg &&
                !showDivider && // Don't group if there's a time divider between them
                prevMsg.authorId === msg.authorId &&
                (currentTimestamp.getTime() - prevTimestamp.getTime() < 5 * 60 * 1000);

              return (
                <React.Fragment key={msg._id}>
                  {showDivider && <TimestampDivider timestamp={formatDividerTimestamp(currentTimestamp)} />}
                  <MessageItem message={msg} isSequential={!!isSequential} />
                </React.Fragment>
              );
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