import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './Layout';
import { useUIStore } from '../shared/stores';

vi.mock('../features/servers/components/ServerList', () => ({
  default: () => <div data-testid="serverList" />,
}));
vi.mock('../features/channels/components/ChannelList', () => ({
  default: () => <div data-testid="channelList" />,
}));
vi.mock('../features/chat/components/ChatArea', () => ({
  default: () => <div data-testid="chatArea" />,
}));
vi.mock('./modals/ModalManager', () => ({
  default: () => <div data-testid="modalManager" />,
}));
vi.mock('../features/users/components/UserSettings', () => ({
  default: () => <div data-testid="userSettings" />,
}));

vi.mock('../shared/hooks/usePresenceEvents', () => ({
  usePresenceEvents: () => {},
}));
vi.mock('../shared/hooks/useGlobalSocketEvents', () => ({
  useGlobalSocketEvents: () => {},
}));
vi.mock('../shared/hooks/useUnreadInitialization', () => ({
  useUnreadInitialization: () => {},
}));
vi.mock('../shared/hooks/useTabNotifier', () => ({
  default: () => {},
}));
vi.mock('../shared/hooks/useMembers', () => ({
  useMembers: () => {},
}));
vi.mock('../features/servers/hooks/useServers', () => ({
  useServers: () => ({ data: undefined }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'Wrapper';
  return Wrapper;
};

describe('Layout', () => {
  beforeEach(() => {
    useUIStore.setState({ targetMessageId: null });
  });

  it('does not clear targetMessageId on mount', async () => {
    useUIStore.setState({ targetMessageId: 'm1' });
    render(<Layout />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(useUIStore.getState().targetMessageId).toBe('m1');
    });
  });
});

