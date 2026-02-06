import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthScreen } from './AuthScreen';
import { useAuthStore } from '../../../shared/stores';

const setUser = vi.fn();
const hydrate = vi.fn().mockResolvedValue(undefined);
const logout = vi.fn().mockResolvedValue(undefined);
useAuthStore.setState({ setUser, hydrate, logout });

vi.mock('../../../shared/services/api', () => ({
  authApi: {
    getConfig: vi.fn().mockResolvedValue({ data: { allowUserRegistration: true } }),
    login: vi.fn().mockResolvedValue({ data: { token: 'fake-token', user: { email: 'test@example.com' } } }),
    register: vi.fn(),
    getMe: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  },
}));

const queryClient = new QueryClient();

const renderComponent = () => {
    render(
        <QueryClientProvider client={queryClient}>
            <AuthScreen />
        </QueryClientProvider>
    );
};

describe('AuthScreen', () => {
    beforeEach(() => {
        setUser.mockClear();
        hydrate.mockClear();
        logout.mockClear();
        queryClient.clear();
    });

  it('allows user to log in successfully', async () => {
    renderComponent();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
        expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'test@example.com' }));
    });
  });
});
