import { Fragment, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import MessageItem from './MessageItem';
import TimestampDivider from './TimestampDivider';
import { formatDividerTimestamp } from '../../../shared/utils/date';
import { isSameDay } from 'date-fns';
import { Message, Channel, ChannelType } from '../../../shared/types';
import { useAuthStore, useUIStore } from '../../../shared/stores';
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

  // 本地 ACK 熔断：避免 setQueryData + effect 互相触发导致死循环。
  const lastAckedMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (useUIStore.getState().targetMessageId) return;
    if (messages.length) bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [channelId, messages.length]);

  useEffect(() => {
    if (targetMessageId && messages.length && !isLoading) {
      const el = document.getElementById(`message-${targetMessageId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-mew-accent/20');
      setTimeout(() => {
        el.classList.remove('bg-mew-accent/20');
        setTargetMessageId(null);
      }, 2000);
    }
  }, [targetMessageId, messages, isLoading, setTargetMessageId]);

  useEffect(() => {
    if (!channel || !channelId || !messages.length || isLoading) return;
    const lastMessage = messages[messages.length - 1];

    // 仅 ACK 真实的 ObjectId（避免误判 24 位 ISO 时间戳）。
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(lastMessage._id);

    const alreadyAckedLocally = lastAckedMessageIdRef.current === lastMessage._id;

    const serverNeedsAck = lastMessage._id !== channel.lastReadMessageId;

    if (isValidObjectId && !alreadyAckedLocally && serverNeedsAck) {
      lastAckedMessageIdRef.current = lastMessage._id;

      const updateChannelCache = (c: Channel) =>
        c._id === channelId ? { ...c, lastReadMessageId: lastMessage._id } : c;

      channelApi.ack(channelId, lastMessage._id)
        .then(() => {
          queryClient.setQueryData<Channel[]>(['dmChannels'], (old) => old?.map(updateChannelCache) || []);

          if (currentServerId) {
            queryClient.setQueryData<Channel[]>(['channels', currentServerId], (old) => old?.map(updateChannelCache) || []);
          }
        })
        .catch((err) => {
          console.warn('ACK failed, resetting local lock', err);
          lastAckedMessageIdRef.current = null;
        });
    }
  }, [messages, channel, channelId, isLoading, queryClient, currentServerId]);

  const isDM = channel?.type === ChannelType.DM;
  const otherUser = isDM ? channel?.recipients?.find((r: any) => r._id !== user?._id) : null;

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col custom-scrollbar">
      {!isLoading ? (
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

              const showDivider = !!prevTimestamp &&
                (!isSameDay(currentTimestamp, prevTimestamp) ||
                  currentTimestamp.getTime() - prevTimestamp.getTime() > 5 * 60 * 1000);

              const isSequential = !!prevMsg && !showDivider &&
                prevMsg.authorId === msg.authorId &&
                currentTimestamp.getTime() - prevTimestamp.getTime() < 5 * 60 * 1000;

              return (
                <Fragment key={msg._id}>
                  {showDivider && <TimestampDivider timestamp={formatDividerTimestamp(currentTimestamp)} />}
                  <MessageItem message={msg} isSequential={!!isSequential} />
                </Fragment>
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
