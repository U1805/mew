import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import MessageInput from './MessageInput';
import { SocketProvider } from '../providers/SocketProvider'; // We need the provider

// Mock the socket context
const mockSocket = {
  emit: vi.fn(),
};

vi.mock('../providers/SocketProvider', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../providers/SocketProvider')>()
    return {
        ...mod,
        useSocket: () => ({ socket: mockSocket, isConnected: true }),
    }
});

const defaultProps = {
    channelId: 'test-channel',
    replyingTo: null,
    setReplyingTo: vi.fn(),
};

describe('MessageInput', () => {
  beforeEach(() => {
    // Clear mock history before each test
    vi.clearAllMocks();
    defaultProps.setReplyingTo.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('should update input value on user typing', async () => {
    render(<MessageInput {...defaultProps} />);
    const input = screen.getByPlaceholderText(/message/i);
    await userEvent.type(input, 'Hello, world!');
    expect(input).toHaveValue('Hello, world!');
  });

  it('should emit a message when user presses Enter', async () => {
    render(<MessageInput {...defaultProps} />);
    const input = screen.getByPlaceholderText(/message/i);

    await userEvent.type(input, 'Test message');
    await userEvent.keyboard('{enter}');

    expect(mockSocket.emit).toHaveBeenCalledWith('message/create', {
      channelId: 'test-channel',
      content: 'Test message',
      referencedMessageId: undefined,
    });
  });

  it('should clear the input after sending a message', async () => {
    render(<MessageInput {...defaultProps} />);
    const input = screen.getByPlaceholderText(/message/i);

    await userEvent.type(input, 'Another message');
    await userEvent.keyboard('{enter}');

    expect(input).toHaveValue('');
  });

  it('should not send an empty message', async () => {
    render(<MessageInput {...defaultProps} />);
    const input = screen.getByPlaceholderText(/message/i);

    await userEvent.keyboard('{enter}');
    // Just press Enter without typing
    expect(mockSocket.emit).not.toHaveBeenCalled();

    await userEvent.type(input, '   '); // Type only spaces
    await userEvent.keyboard('{enter}');
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

    it('should display a reply banner when replying', () => {
        const replyingToMessage = { _id: 'reply-1', content: 'Original message', author: { username: 'OriginalPoster' } };
        render(<MessageInput {...defaultProps} replyingTo={replyingToMessage} />);

        expect(screen.getByText('Replying to')).toBeInTheDocument();
        expect(screen.getByText('OriginalPoster')).toBeInTheDocument();
    });

    it('should include referencedMessageId when replying', async () => {
        const replyingToMessage = { _id: 'reply-1', content: 'Original message', author: { username: 'OriginalPoster' } };
        render(<MessageInput {...defaultProps} replyingTo={replyingToMessage} />);
        const input = screen.getByPlaceholderText(/message/i);

        await userEvent.type(input, 'This is a reply');
        await userEvent.keyboard('{enter}');

        expect(mockSocket.emit).toHaveBeenCalledWith('message/create', {
            channelId: 'test-channel',
            content: 'This is a reply',
            referencedMessageId: 'reply-1',
        });
    });
});
