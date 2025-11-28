import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import MessageView from './MessageView';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

vi.mock('@/lib/api');
vi.mock('@/store/authStore');
vi.mock('emoji-picker-react', () => ({
    __esModule: true,
    default: ({ onEmojiClick }) => <div data-testid="emoji-picker" onClick={() => onEmojiClick({ emoji: '👍' })}></div>,
}));

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};
vi.mock('@/components/providers/SocketProvider', async (importOriginal) => {
    const mod = await importOriginal<typeof import('@/components/providers/SocketProvider')>();
    return {
        ...mod,
        useSocket: () => ({ socket: mockSocket, isConnected: true }),
    };
});

const renderWithProviders = (ui: React.ReactElement, { currentUser = { _id: 'default-test-user', username: 'default-test-user' } } = {}) => {
  vi.mocked(useAuthStore).mockReturnValue({ user: currentUser, token: 'fake-token', getState: () => ({ user: currentUser, token: 'fake-token' }) } as any);

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/app/server/1/channel/test-channel']}>
          <Routes>
            <Route path="/app/server/:serverId/channel/:channelId" element={ui} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
    queryClient,
  };
};

describe('MessageView', () => {
    const mockedApiGet = api.get as vi.Mock;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSocket.on.mockClear();
        mockSocket.off.mockClear();
    });

    it('renders initial messages correctly', async () => {
        const initialMessagesPage = { messages: [{ _id: '1', content: 'Hello', author: { username: 'Alice' } }] };
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        renderWithProviders(<MessageView setReplyingTo={vi.fn()} />);
        expect(await screen.findByText('Hello')).toBeInTheDocument();
    });

    it('updates with a new message from socket', async () => {
        const initialMessagesPage = { messages: [] };
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        const { queryClient } = renderWithProviders(<MessageView setReplyingTo={vi.fn()} />);
        await waitFor(() => expect(queryClient.getQueryData(['channels', 'test-channel', 'messages'])).toBeDefined());
        const newMessage = { _id: '3', channelId: 'test-channel', content: 'A new message', author: { username: 'Charlie' } };
        const messageCallback = mockSocket.on.mock.calls.find(call => call[0] === 'message/create')?.[1];
        messageCallback(newMessage);
        await waitFor(() => {
            expect(screen.getByText('A new message')).toBeInTheDocument();
        });
    });

    it('displays a BOT tag for bot messages', async () => {
        const initialMessagesPage = { messages: [{ _id: '1', content: 'I am a bot', author: { username: 'Botty', isBot: true } }]};
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        renderWithProviders(<MessageView setReplyingTo={vi.fn()} />);
        expect(await screen.findByText('BOT')).toBeInTheDocument();
    });

    it('renders a custom component for custom message types', async () => {
        const initialMessagesPage = { messages: [{_id: '1', content: 'RSS', author: { username: 'Feedy' }, type: 'app/x-rss-card', payload: { title: 'New Article' }}]};
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        renderWithProviders(<MessageView setReplyingTo={vi.fn()} />);
        expect(await screen.findByText('New Article')).toBeInTheDocument();
        expect(screen.queryByText('RSS')).not.toBeInTheDocument();
    });

    it('renders the context of a replied message', async () => {
        const originalMessage = { _id: '1', content: 'Original Message', author: { username: 'Alice' } };
        const replyMessage = { _id: '2', content: 'This is a reply', author: { username: 'Bob' }, referencedMessage: originalMessage };
        const initialMessagesPage = { messages: [replyMessage] };
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        renderWithProviders(<MessageView setReplyingTo={vi.fn()} />);
        expect(await screen.findByText('This is a reply')).toBeInTheDocument();
        expect(screen.getByText('Original Message')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('allows the author to edit a message', async () => {
        const author = { _id: 'author-id', username: 'test-author' };
        const initialMessagesPage = { messages: [{ _id: '1', content: 'Editable', author }] };
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        const mockedApiPatch = api.patch as vi.Mock;
        mockedApiPatch.mockResolvedValue({});

        renderWithProviders(<MessageView setReplyingTo={vi.fn()} />, { currentUser: author });

        const messageContainer = await screen.findByText('Editable');
        const parentGroup = messageContainer.closest('.group');
        await userEvent.hover(parentGroup!);

        const editButton = await screen.findByRole('button', { name: /edit/i });
        await userEvent.click(editButton);

        const editor = screen.getByDisplayValue('Editable');
        await userEvent.clear(editor);
        await userEvent.type(editor, 'Edited content');
        await userEvent.keyboard('{enter}');

        await waitFor(() => {
            expect(screen.getByText('Edited content')).toBeInTheDocument();
        });
        expect(mockedApiPatch).toHaveBeenCalledWith('/channels/test-channel/messages/1', { content: 'Edited content' });
    });

    it('allows the author to delete a message', async () => {
        const author = { _id: 'author-id', username: 'test-author' };
        const initialMessagesPage = { messages: [{ _id: '1', content: 'Deletable', author }] };
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        const mockedApiDelete = api.delete as vi.Mock;
        mockedApiDelete.mockResolvedValue({});

        renderWithProviders(<MessageView setReplyingTo={vi.fn()} />, { currentUser: author });

        const messageContainer = await screen.findByText('Deletable');
        const parentGroup = messageContainer.closest('.group');
        await userEvent.hover(parentGroup!);

        const deleteButton = await screen.findByRole('button', { name: /delete/i });
        window.confirm = vi.fn(() => true);

        await userEvent.click(deleteButton);

        await waitFor(() => {
            expect(screen.queryByText('Deletable')).not.toBeInTheDocument();
        });
        expect(mockedApiDelete).toHaveBeenCalledWith('/channels/test-channel/messages/1');
    });

    it('allows a user to add and remove a reaction', async () => {
        const author = { _id: 'author-id', username: 'test-author' };
        const initialMessagesPage = { messages: [{ _id: '1', content: 'Reactable', author, reactions: [] }] };
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        const mockedApiPut = api.put as vi.Mock;
        mockedApiPut.mockResolvedValue({});
        const mockedApiDelete = api.delete as vi.Mock;
        mockedApiDelete.mockResolvedValue({});

        renderWithProviders(<MessageView setReplyingTo={vi.fn()} />, { currentUser: author });

        const addReactionButton = await screen.findByRole('button', { name: /add reaction/i });
        await userEvent.click(addReactionButton);

        const emojiPicker = await screen.findByTestId('emoji-picker');
        await userEvent.click(emojiPicker);

        await waitFor(() => {
            expect(screen.getByText('👍')).toBeInTheDocument();
            expect(screen.getByText('1')).toBeInTheDocument(); // Count of reactions
        });

        expect(mockedApiPut).toHaveBeenCalledWith('/channels/test-channel/messages/1/reactions/%F0%9F%91%8D/@me');

        // Now, remove the reaction
        const reaction = screen.getByText('👍');
        await userEvent.click(reaction);

        await waitFor(() => {
            expect(screen.queryByText('👍')).not.toBeInTheDocument();
        });
        expect(mockedApiDelete).toHaveBeenCalledWith('/channels/test-channel/messages/1/reactions/%F0%9F%91%8D/@me');
    });

    it('updates reactions via socket event', async () => {
        const initialMessagesPage = { messages: [{ _id: '1', content: 'A message', author: { username: 'Alice' }, reactions: [] }] };
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        renderWithProviders(<MessageView setReplyingTo={vi.fn()} />);

        await screen.findByText('A message');

        const reactionCallback = mockSocket.on.mock.calls.find(call => call[0] === 'reaction/add')?.[1];
        reactionCallback({ messageId: '1', reaction: [{ emoji: '🎉', userIds: ['some-user'] }] });

        await waitFor(() => {
            expect(screen.getByText('🎉')).toBeInTheDocument();
                    expect(screen.getByText('1')).toBeInTheDocument();
        });
    });

    it('updates a message via socket event', async () => {
        const initialMessagesPage = { messages: [{ _id: '1', content: 'Original content', author: { username: 'Alice' } }] };
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        renderWithProviders(<MessageView setReplyingTo={vi.fn()} />);

        expect(await screen.findByText('Original content')).toBeInTheDocument();

        const updateCallback = mockSocket.on.mock.calls.find(call => call[0] === 'message/update')?.[1];
        updateCallback({ _id: '1', content: 'Updated content' });

        await waitFor(() => {
            expect(screen.queryByText('Original content')).not.toBeInTheDocument();
            expect(screen.getByText('Updated content')).toBeInTheDocument();
        });
    });

    it('deletes a message via socket event', async () => {
        const initialMessagesPage = { messages: [{ _id: '1', content: 'To be deleted', author: { username: 'Alice' } }] };
        mockedApiGet.mockResolvedValue({ data: initialMessagesPage });
        renderWithProviders(<MessageView setReplyingTo={vi.fn()} />);

        expect(await screen.findByText('To be deleted')).toBeInTheDocument();

        const deleteCallback = mockSocket.on.mock.calls.find(call => call[0] === 'message/delete')?.[1];
        deleteCallback({ messageId: '1', channelId: 'test-channel' });

        await waitFor(() => {
            expect(screen.queryByText('To be deleted')).not.toBeInTheDocument();
        });
    });
});
