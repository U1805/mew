import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ServerList from './ServerList';
import * as api from '@/lib/api';

// Mocks are in the global setup file: src/test/setup.ts
vi.mock('@/lib/api');

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('ServerList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    const queryClient = createTestQueryClient();
    (api.default.get as vi.Mock).mockReturnValue(new Promise(() => {})); // Keep it in loading state
    render(
      <QueryClientProvider client={queryClient}>
        <ServerList />
      </QueryClientProvider>
    );
    expect(screen.getByText('Loading servers...')).toBeInTheDocument();
  });

  it('shows the server list on successful fetch', async () => {
    const mockServers = [
      { _id: '1', name: 'Server A' },
      { _id: '2', name: 'Server B', avatarUrl: 'http://example.com/avatar.png' },
    ];
    (api.default.get as vi.Mock).mockResolvedValue({ data: mockServers });
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ServerList />
      </QueryClientProvider>
    );
    expect(await screen.findByText('S')).toBeInTheDocument();
    expect(await screen.findByAltText('Server B')).toBeInTheDocument();
  });

  it('shows an error message on failed fetch', async () => {
    const errorMessage = 'Network Error';
    (api.default.get as vi.Mock).mockRejectedValue(new Error(errorMessage));
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ServerList />
      </QueryClientProvider>
    );
    expect(await screen.findByText(`Error: ${errorMessage}`)).toBeInTheDocument();
  });
});