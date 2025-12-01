import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChannelList from './ChannelList';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, useModalStore, useUIStore } from '../../store';

vi.mock('../../store');
vi.mock('../../hooks/useServerEvents', () => ({ useServerEvents: vi.fn() })); // Mock this hook as it's not relevant to this test

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('ChannelList', () => {
  const mockOpenModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUIStore).mockReturnValue({ currentServerId: 'server-1', currentChannelId: 'channel-1' });
    vi.mocked(useModalStore).mockReturnValue({ openModal: mockOpenModal });
    // This mock needs to satisfy both getState and the hook usage
    vi.mocked(useAuthStore).getState = () => ({ token: 'fake-token' });
  });

  it('shows category settings cog for server owner', async () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { _id: 'user-1' } } as any);

    render(<ChannelList />, { wrapper });

    const firstCategory = await screen.findByText('General');
    const settingsCog = firstCategory.closest('.group').querySelector('[title="Edit Category"]');
    expect(settingsCog).toBeInTheDocument();
  });

  it('hides category settings cog for non-owners', async () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { _id: 'user-2' } } as any);

    render(<ChannelList />, { wrapper });

    const firstCategory = await screen.findByText('General');
    const settingsCog = firstCategory.closest('.group').querySelector('[title="Edit Category"]');
    expect(settingsCog).not.toBeInTheDocument();
  });

  it('calls openModal when settings cog is clicked', async () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { _id: 'user-1' } } as any);

    render(<ChannelList />, { wrapper });

    const firstCategory = await screen.findByText('General');
    const settingsCog = firstCategory.closest('.group').querySelector('[title="Edit Category"]');

    fireEvent.click(settingsCog);

    expect(mockOpenModal).toHaveBeenCalledWith('editCategory', {
      category: expect.objectContaining({ _id: 'category-1', name: 'General' }),
    });
  });
});
