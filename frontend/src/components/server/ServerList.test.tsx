import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ServerList from './ServerList';
import * as api from '@/lib/api'; // Import as a module to mock
import { useAuthStore } from '@/store/authStore';

// Mock the auth store
vi.mock('@/store/authStore');

// Mock the entire api module
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

// Create a query client for each test
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // Prevent retries in tests
    },
  },
});

describe('ServerList', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Mock useAuthStore to return a token
    (useAuthStore as unknown as vi.Mock).mockReturnValue({ token: 'fake-token' });
  });

  it('shows loading state initially', () => {
    // We don't mock the api.get here, so it will be in a loading state
    const queryClient = createTestQueryClient();
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

    // Mock the API response
    (api.default.get as vi.Mock).mockResolvedValue({ data: mockServers });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ServerList />
      </QueryClientProvider>
    );

    // Wait for the server names to appear
    expect(await screen.findByText('A')).toBeInTheDocument(); // Server A initial
    expect(await screen.findByAltText('Server B')).toBeInTheDocument(); // Server B avatar
  });

  it('shows an error message on failed fetch', async () => {
    // Mock the API to throw an error
    const errorMessage = 'Network Error';
    (api.default.get as vi.Mock).mockRejectedValue(new Error(errorMessage));

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ServerList />
      </QueryClientProvider>
    );

    // Wait for the error message to appear
    expect(await screen.findByText(`Error: ${errorMessage}`)).toBeInTheDocument();
  });
});
