import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { AuthScreen } from './Auth';
import { useAuthStore } from '../../shared/stores/store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the auth store
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
        // The first call is to set the token, the second is to set the user
        expect(setAuth).toHaveBeenCalledWith('fake-token', null, false);
        expect(setAuth).toHaveBeenCalledWith('fake-token', expect.objectContaining({ email: 'test@example.com' }), false);
    });
  });
});