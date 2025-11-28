import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ChannelPage from './ChannelPage';

vi.mock('../components/message/MessageView', () => ({
    __esModule: true,
    default: ({ setReplyingTo }) => {
        return <div data-testid="message-view" onClick={() => setReplyingTo({ _id: '1', author: { username: 'test' } })}>MessageView</div>;
    }
}));

vi.mock('../components/message/MessageInput', () => ({
    __esModule: true,
    default: ({ replyingTo }) => {
        return <div data-testid="message-input">{replyingTo ? `Replying to ${replyingTo.author.username}` : 'MessageInput'}</div>;
    }
}));

describe('ChannelPage', () => {
    it('renders the message view and input', () => {
        render(
            <MemoryRouter initialEntries={['/app/server/1/channel/test']}>
                <Routes>
                    <Route path="/app/server/:serverId/channel/:channelId" element={<ChannelPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByTestId('message-view')).toBeInTheDocument();
        expect(screen.getByTestId('message-input')).toBeInTheDocument();
    });
});
