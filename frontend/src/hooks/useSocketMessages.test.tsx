import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useSocketMessages } from './useSocketMessages';
import { getSocket } from '@/services/socket';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { Message } from '@/types';

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};
vi.mock('@/services/socket', () => ({
  getSocket: () => mockSocket,
}));

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => (
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
    const newMessage: Message = { _id: '3', content: 'New message', channelId, authorId: 'user-2', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const initialMessages: Message[] = [{ _id: '1', content: 'Hi', channelId, authorId: 'user-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];

    queryClient.setQueryData(['messages', channelId], initialMessages);
    renderHook(() => useSocketMessages(channelId), { wrapper });

    // Simulate a socket event
    const messageCreateHandler = mockSocket.on.mock.calls.find(call => call[0] === 'MESSAGE_CREATE')[1];
    messageCreateHandler(newMessage);

    const updatedMessages = queryClient.getQueryData<Message[]>(['messages', channelId]);
    expect(updatedMessages).toHaveLength(2);
    expect(updatedMessages?.[1]).toEqual(newMessage);
  });

  it('should update a message in the query cache on MESSAGE_UPDATE', () => {
    const channelId = 'channel-1';
    const originalMessage: Message = { _id: '1', content: 'Original', channelId, authorId: 'user-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const updatedMessage: Message = { ...originalMessage, content: 'Updated' };

    queryClient.setQueryData(['messages', channelId], [originalMessage]);
    renderHook(() => useSocketMessages(channelId), { wrapper });

    const messageUpdateHandler = mockSocket.on.mock.calls.find(call => call[0] === 'MESSAGE_UPDATE')[1];
    messageUpdateHandler(updatedMessage);

    const messages = queryClient.getQueryData<Message[]>(['messages', channelId]);
    expect(messages?.[0].content).toBe('Updated');
  });

  it('should remove a message from the query cache on MESSAGE_DELETE', () => {
    const channelId = 'channel-1';
    const messageToDelete: Message = { _id: '1', content: 'Delete me', channelId, authorId: 'user-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

    queryClient.setQueryData(['messages', channelId], [messageToDelete]);
    renderHook(() => useSocketMessages(channelId), { wrapper });

    const messageDeleteHandler = mockSocket.on.mock.calls.find(call => call[0] === 'MESSAGE_DELETE')[1];
    messageDeleteHandler({ messageId: '1', channelId });

    const messages = queryClient.getQueryData<Message[]>(['messages', channelId]);
    expect(messages).toHaveLength(0);
  });
});