import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useSocket } from '../providers/SocketProvider';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import MessageActionMenu from './MessageActionMenu';
import MessageEditor from './MessageEditor';
import Reactions from './Reactions';
import MessageContent from './MessageContent';

interface User {
  _id: string;
  username: string;
  avatarUrl?: string;
  isBot?: boolean;
}

interface Message {
  _id: string;
  channelId: string;
  content: string;
  author: User;
  type?: string;
  payload?: any;
  referencedMessage?: Message;
  reactions?: { emoji: string; userIds: string[] }[];
}

interface MessagesPage {
  messages: Message[];
  nextCursor?: string;
}

const fetchMessages = async ({ pageParam, channelId }: { pageParam?: string; channelId: string }): Promise<MessagesPage> => {
  const { data } = await api.get(`/channels/${channelId}/messages`, {
    params: { before: pageParam, limit: 20 },
  });
  return data;
};

const MessageItem = ({ message, topMessageRef, setReplyingTo }) => {
    const { user } = useAuthStore();
    const [isEditing, setIsEditing] = useState(false);
    const isAuthor = message.author?._id === user?._id;

    return (
        <div
            key={message._id}
            ref={topMessageRef}
            className="relative group flex items-start space-x-4 pr-12"
        >
            <img src={message.author?.avatarUrl} alt={message.author?.username} className="w-10 h-10 rounded-full bg-gray-400" />
            <div className="flex-1">
                <div className="flex items-center space-x-2">
                    <p className="font-bold">{message.author?.username || 'User'}</p>
                    {message.author?.isBot && (
                        <span className="text-xs bg-blue-500 text-white font-semibold px-2 py-0.5 rounded-full">BOT</span>
                    )}
                </div>
                {isEditing ? (
                    <MessageEditor message={message} setIsEditing={setIsEditing} />
                ) : (
                    <>
                    {message.referencedMessage && (
                        <div className="text-sm text-gray-400 pl-2 border-l-2 border-gray-500 mb-1">
                            <strong>{message.referencedMessage.author.username}</strong>
                            <p className="truncate">{message.referencedMessage.content}</p>
                        </div>
                    )}
                    <MessageContent message={message} />
                    <Reactions message={message} />
                    </>
                )}
                {isAuthor && !isEditing && (
                    <MessageActionMenu message={message} setIsEditing={setIsEditing} setReplyingTo={setReplyingTo} />
                )}
            </div>
        </div>
    );
}

const MessageView: React.FC = ({ setReplyingTo }) => {
  const { channelId } = useParams<{ channelId: string }>();
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<MessagesPage>({
    queryKey: ['channels', channelId, 'messages'],
    queryFn: ({ pageParam }) => fetchMessages({ pageParam, channelId: channelId! }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!channelId,
    retry: (failureCount, error: any) => {
        if (error.response?.status === 404) {
            return false;
        }
        return failureCount < 3;
    }
  });

  useEffect(() => {
    if (!socket || !channelId) return;

    const handleNewMessage = (message: Message) => {
      if (message.channelId !== channelId) return;
      queryClient.setQueryData(['channels', channelId, 'messages'], (oldData: any) => {
        if (!oldData || !oldData.pages || oldData.pages.length === 0) {
          return { pages: [{ messages: [message] }], pageParams: [undefined] };
        }
        const newPages = oldData.pages.map((page, index) => {
          if (index === 0) return { ...page, messages: [message, ...page.messages] };
          return page;
        });
        return { ...oldData, pages: newPages };
      });
    };

    const handleUpdateMessage = (updatedMessage: Partial<Message> & { _id: string }) => {
      queryClient.setQueryData(['channels', channelId, 'messages'], (oldData: any) => {
        if (!oldData) return oldData;
        const newPages = oldData.pages.map(page => ({
          ...page,
          messages: page.messages.map(m => m._id === updatedMessage._id ? { ...m, ...updatedMessage } : m),
        }));
        return { ...oldData, pages: newPages };
      });
    };

    const handleReaction = ({ messageId, reaction }: { messageId: string, reaction: any }) => {
      queryClient.setQueryData(['channels', channelId, 'messages'], (oldData: any) => {
        if (!oldData) return oldData;
        const newPages = oldData.pages.map(page => ({
          ...page,
          messages: page.messages.map(m => {
            if (m._id !== messageId) return m;
            // This is a simplified update. A real implementation would be more robust.
            return { ...m, reactions: reaction };
          }),
        }));
        return { ...oldData, pages: newPages };
      });
    };

    const handleDeleteMessage = ({ messageId }: { messageId: string }) => {
      queryClient.setQueryData(['channels', channelId, 'messages'], (oldData: any) => {
        if (!oldData) return oldData;
        const newPages = oldData.pages.map(page => ({
          ...page,
          messages: page.messages.filter(m => m._id !== messageId),
        }));
        return { ...oldData, pages: newPages };
      });
    };

    socket.on('message/create', handleNewMessage);
    socket.on('message/update', handleUpdateMessage);
    socket.on('message/delete', handleDeleteMessage);
    socket.on('reaction/add', handleReaction);
    socket.on('reaction/remove', handleReaction);

    return () => {
      socket.off('message/create', handleNewMessage);
      socket.off('message/update', handleUpdateMessage);
      socket.off('message/delete', handleDeleteMessage);
      socket.off('reaction/add', handleReaction);
      socket.off('reaction/remove', handleReaction);
    };
  }, [socket, channelId, queryClient]);

  const observer = useRef<IntersectionObserver>();
  const topMessageRef = useCallback(
    (node: HTMLDivElement) => {
      if (isFetchingNextPage) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) fetchNextPage();
      });
      if (node) observer.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage]
  );

  const allMessages = data?.pages.flatMap((page) => page.messages) ?? [];

  return (
    <div className="flex-1 flex flex-col-reverse overflow-y-auto p-4 space-y-4 space-y-reverse">
      <div>
        {allMessages.map((msg, index) => (
            <MessageItem
                key={msg._id}
                message={msg}
                topMessageRef={index === allMessages.length - 1 ? topMessageRef : null}
                setReplyingTo={setReplyingTo}
            />
        ))}
      </div>
      {isFetchingNextPage && <div className="text-center">Loading more...</div>}
    </div>
  );
};

export default MessageView;
