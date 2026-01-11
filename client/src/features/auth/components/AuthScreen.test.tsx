import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthScreen } from './AuthScreen';
import { useAuthStore } from '../../../shared/stores';

const setAuth = vi.fn();
useAuthStore.setState({ setAuth });

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
        setAuth.mockClear();
        queryClient.clear();
    });

  it('allows user to log in successfully', async () => {
    renderComponent();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
        expect(setAuth).toHaveBeenCalledWith('fake-token', expect.objectContaining({ email: 'test@example.com' }), true);
    });
  });
});
