import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { Message } from '../types';

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const isTempMessageId = (id: string) => !OBJECT_ID_RE.test(id);

const getAuthorId = (message: Message): string => {
  if (typeof message.authorId === 'string') return message.authorId;
  if (message.authorId && typeof message.authorId === 'object' && typeof message.authorId._id === 'string') {
    return message.authorId._id;
  }
  return '';
};

const getClientNonce = (message: Message): string => {
  const payload = message.payload;
  if (!payload || typeof payload !== 'object') return '';
  const nonce = (payload as Record<string, unknown>).clientNonce;
  return typeof nonce === 'string' ? nonce : '';
};

const dedupeByIdKeepFirst = (messages: Message[]): Message[] => {
  const seen = new Set<string>();
  const result: Message[] = [];
  for (const message of messages) {
    if (seen.has(message._id)) continue;
    seen.add(message._id);
    result.push(message);
  }
  return result;
};

export const useSocketMessages = (channelId: string | null, options?: { enabled?: boolean }) => {
  const queryClient = useQueryClient();
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!channelId || !enabled) return;

    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = (newMessage: Message) => {
      if (newMessage.channelId === channelId) {
        queryClient.setQueryData(['messages', channelId], (old: Message[] | undefined) => {
          if (!old) return [newMessage];

          const nonce = getClientNonce(newMessage);
          const authorId = getAuthorId(newMessage);

          const replaceAt = (index: number) => {
            const next = [...old];
            next[index] = newMessage;
            return next.filter((m, i) => m._id !== newMessage._id || i === index);
          };

          // Exact optimistic reconcile path.
          if (nonce) {
            const tempByNonceIndex = old.findIndex(
              (m) => isTempMessageId(m._id) && getClientNonce(m) === nonce
            );
            if (tempByNonceIndex > -1) {
              return replaceAt(tempByNonceIndex);
            }
          }

          const existingRealIndex = old.findIndex((m) => m._id === newMessage._id);
          if (existingRealIndex > -1) {
            // If global handler inserted the real message first, still clean orphan optimistic rows.
            const withoutMatchedTemp = nonce
              ? old.filter((m) => !(isTempMessageId(m._id) && getClientNonce(m) === nonce))
              : old;
            const updated = withoutMatchedTemp.map((m) => (m._id === newMessage._id ? newMessage : m));
            return dedupeByIdKeepFirst(updated);
          }

          // Legacy fallback for old optimistic entries without clientNonce.
          const legacyTempIndex = old.findIndex((m) => {
            if (!isTempMessageId(m._id)) return false;
            if (m.content !== newMessage.content) return false;
            const tempAuthorId = getAuthorId(m);
            if (authorId && tempAuthorId && tempAuthorId !== authorId) return false;
            return true;
          });
          if (legacyTempIndex > -1) {
            return replaceAt(legacyTempIndex);
          }

          return [...old, newMessage];
        });
      }
    };

    const handleUpdateMessage = (updatedMessage: Message) => {
      if (channelId && updatedMessage.channelId === channelId) {
        queryClient.setQueryData(['messages', channelId], (old: Message[] | undefined) => {
          if (!old) return old;
          return old.map(m => m._id === updatedMessage._id ? updatedMessage : m);
        });
      }
    };

    const handleDeleteMessage = ({ messageId, channelId: msgChannelId }: { messageId: string, channelId: string }) => {
      if (channelId && msgChannelId === channelId) {
        queryClient.setQueryData(['messages', channelId], (old: Message[] | undefined) => {
          if (!old) return old;
          return old.filter(m => m._id !== messageId);
        });
      }
    };

    const reconcileChannelMessages = () => {
      if (!channelId) return;
      // Recover from possible dropped socket events during reconnect / room re-sync.
      void queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
    };

    socket.on('MESSAGE_CREATE', handleNewMessage);
    socket.on('MESSAGE_UPDATE', handleUpdateMessage);
    socket.on('MESSAGE_DELETE', handleDeleteMessage);
    socket.on('MESSAGE_REACTION_ADD', handleUpdateMessage);
    socket.on('MESSAGE_REACTION_REMOVE', handleUpdateMessage);
    socket.on('connect', reconcileChannelMessages);
    socket.on('ready', reconcileChannelMessages);

    return () => {
      socket.off('MESSAGE_CREATE', handleNewMessage);
      socket.off('MESSAGE_UPDATE', handleUpdateMessage);
      socket.off('MESSAGE_DELETE', handleDeleteMessage);
      socket.off('MESSAGE_REACTION_ADD', handleUpdateMessage);
      socket.off('MESSAGE_REACTION_REMOVE', handleUpdateMessage);
      socket.off('connect', reconcileChannelMessages);
      socket.off('ready', reconcileChannelMessages);
    };
  }, [channelId, enabled, queryClient]);
};
