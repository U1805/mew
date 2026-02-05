import { useAuthStore } from '.';
import { act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { User } from '../types';

const mockUser: User = {
    _id: 'user-1',
    username: 'Test User',
    email: 'test@example.com',
    isBot: false,
    createdAt: new Date().toISOString()
};

vi.mock('../services/api', () => ({
  authApi: {
    logout: vi.fn().mockResolvedValue({}),
    refresh: vi.fn().mockResolvedValue({}),
    getMe: vi.fn().mockResolvedValue({ data: mockUser }),
  },
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    act(() => {
      useAuthStore.setState({ status: 'unknown', user: null });
    });
    localStorage.clear();
  });

  it('setUser should update user in state and localStorage', () => {
    act(() => {
      useAuthStore.getState().setUser(mockUser);
    });

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(localStorage.getItem('mew_user')).toBe(JSON.stringify(mockUser));
  });

  it('logout should clear user from state and localStorage', async () => {
    act(() => {
      useAuthStore.getState().setUser(mockUser);
    });

    await act(async () => {
      await useAuthStore.getState().logout();
    });

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem('mew_user')).toBeNull();
  });
});
