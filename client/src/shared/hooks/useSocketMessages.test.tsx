import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSocketMessages } from './useSocketMessages';
import { Message } from '../types';

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};
vi.mock('../../shared/services/socket', () => ({
  getSocket: () => mockSocket,
}));

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useSocketMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('should not register listeners if channelId is null', () => {
    renderHook(() => useSocketMessages(null), { wrapper });
    expect(mockSocket.on).not.toHaveBeenCalled();
  });

  it('should register and unregister socket listeners for a given channelId', () => {
    const { unmount } = renderHook(() => useSocketMessages('channel-1'), { wrapper });

    expect(mockSocket.on).toHaveBeenCalledWith('MESSAGE_CREATE', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('MESSAGE_UPDATE', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('MESSAGE_DELETE', expect.any(Function));

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('MESSAGE_CREATE', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('MESSAGE_UPDATE', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('MESSAGE_DELETE', expect.any(Function));
  });

  it('should add a new message to the query cache on MESSAGE_CREATE', () => {
    const channelId = 'channel-1';
    const newMessage: Message = { _id: '3', content: 'New message', channelId, authorId: 'user-2', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'DEFAULT' };
    const initialMessages: Message[] = [{ _id: '1', content: 'Hi', channelId, authorId: 'user-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'DEFAULT' }];

    queryClient.setQueryData(['messages', channelId], initialMessages);
    renderHook(() => useSocketMessages(channelId), { wrapper });

    const messageCreateHandler = (mockSocket.on as Mock).mock.calls.find(call => call[0] === 'MESSAGE_CREATE')[1];
    messageCreateHandler(newMessage);

    const updatedMessages = queryClient.getQueryData<Message[]>(['messages', channelId]);
    expect(updatedMessages).toHaveLength(2);
    expect(updatedMessages?.[1]).toEqual(newMessage);
  });

  it('should replace optimistic message by clientNonce on MESSAGE_CREATE', () => {
    const channelId = 'channel-1';
    const nonce = 'nonce-1';
    const tempMessage: Message = {
      _id: '2026-02-26T10:10:10.000Z',
      content: 'same content',
      channelId,
      authorId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'DEFAULT',
      payload: { clientNonce: nonce },
    };
    const realMessage: Message = {
      _id: '507f1f77bcf86cd799439011',
      content: 'same content',
      channelId,
      authorId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'DEFAULT',
      payload: { clientNonce: nonce },
    };

    queryClient.setQueryData(['messages', channelId], [tempMessage]);
    renderHook(() => useSocketMessages(channelId), { wrapper });

    const messageCreateHandler = (mockSocket.on as Mock).mock.calls.find(call => call[0] === 'MESSAGE_CREATE')[1];
    messageCreateHandler(realMessage);

    const updatedMessages = queryClient.getQueryData<Message[]>(['messages', channelId]);
    expect(updatedMessages).toHaveLength(1);
    expect(updatedMessages?.[0]).toEqual(realMessage);
  });

  it('should remove matched optimistic residue when real message already exists', () => {
    const channelId = 'channel-1';
    const nonce = 'nonce-2';
    const realMessageInCache: Message = {
      _id: '507f1f77bcf86cd799439012',
      content: 'hello',
      channelId,
      authorId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'DEFAULT',
      payload: { clientNonce: nonce },
    };
    const staleTemp: Message = {
      _id: '2026-02-26T10:10:11.000Z',
      content: 'hello',
      channelId,
      authorId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'DEFAULT',
      payload: { clientNonce: nonce },
    };
    const incomingReal: Message = {
      ...realMessageInCache,
      content: 'hello updated',
    };

    queryClient.setQueryData(['messages', channelId], [realMessageInCache, staleTemp]);
    renderHook(() => useSocketMessages(channelId), { wrapper });

    const messageCreateHandler = (mockSocket.on as Mock).mock.calls.find(call => call[0] === 'MESSAGE_CREATE')[1];
    messageCreateHandler(incomingReal);

    const updatedMessages = queryClient.getQueryData<Message[]>(['messages', channelId]);
    expect(updatedMessages).toHaveLength(1);
    expect(updatedMessages?.[0]).toEqual(incomingReal);
  });

  it('should update a message in the query cache on MESSAGE_UPDATE', () => {
    const channelId = 'channel-1';
    const originalMessage: Message = { _id: '1', content: 'Original', channelId, authorId: 'user-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'DEFAULT' };
    const updatedMessage: Message = { ...originalMessage, content: 'Updated' };

    queryClient.setQueryData(['messages', channelId], [originalMessage]);
    renderHook(() => useSocketMessages(channelId), { wrapper });

    const messageUpdateHandler = (mockSocket.on as Mock).mock.calls.find(call => call[0] === 'MESSAGE_UPDATE')[1];
    messageUpdateHandler(updatedMessage);

    const messages = queryClient.getQueryData<Message[]>(['messages', channelId]);
    expect(messages?.[0].content).toBe('Updated');
  });

  it('should remove a message from the query cache on MESSAGE_DELETE', () => {
    const channelId = 'channel-1';
    const messageToDelete: Message = { _id: '1', content: 'Delete me', channelId, authorId: 'user-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'DEFAULT' };

    queryClient.setQueryData(['messages', channelId], [messageToDelete]);
    renderHook(() => useSocketMessages(channelId), { wrapper });

    const messageDeleteHandler = (mockSocket.on as Mock).mock.calls.find(call => call[0] === 'MESSAGE_DELETE')[1];
    messageDeleteHandler({ messageId: '1', channelId });

    const messages = queryClient.getQueryData<Message[]>(['messages', channelId]);
    expect(messages).toHaveLength(0);
  });
});
