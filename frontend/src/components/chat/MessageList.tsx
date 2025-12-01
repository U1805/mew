import React, { useRef, useEffect } from 'react';
import { Message, Channel } from '../../types';
import MessageItem from './MessageItem';
import { Icon } from '@iconify/react';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  channel: Channel | null;
  channelId: string | null;
}

const MessageList: React.FC<MessageListProps> = ({ messages, isLoading, channel, channelId }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [channelId, messages?.length]);

  const handleSocketMessage = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col custom-scrollbar">
      {!isLoading && messages ? (
        <div className="flex flex-col justify-end min-h-0">
          <div className="mt-auto flex flex-col pb-4">
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
  );
};

export default MessageList;