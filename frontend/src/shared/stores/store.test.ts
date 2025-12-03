import { useAuthStore } from './store';
import { act } from '@testing-library/react';
import { User } from '@/shared/types/index';
import { describe, it, expect, beforeEach } from 'vitest';

const mockUser: User = {
    _id: 'user-1',
    username: 'Test User',
    email: 'test@example.com',
    isBot: false,
    createdAt: new Date().toISOString()
};

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    act(() => {
      useAuthStore.setState({ token: null, user: null });
    });
    localStorage.clear();
    sessionStorage.clear();
  });

  it('setAuth should update token and user in state and localStorage', () => {
    act(() => {
      useAuthStore.getState().setAuth('fake-token', mockUser, true);
    });

    expect(useAuthStore.getState().token).toBe('fake-token');
    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(localStorage.getItem('mew_token')).toBe('fake-token');
    expect(localStorage.getItem('mew_user')).toBe(JSON.stringify(mockUser));
    expect(sessionStorage.getItem('mew_token')).toBeNull();
  });

  it('setAuth should update token and user in state and sessionStorage', () => {
    act(() => {
      useAuthStore.getState().setAuth('fake-token-session', mockUser, false);
    });

    expect(useAuthStore.getState().token).toBe('fake-token-session');
    expect(sessionStorage.getItem('mew_token')).toBe('fake-token-session');
    expect(localStorage.getItem('mew_token')).toBeNull();
  });

  it('logout should clear token and user from state and storage', () => {
    act(() => {
      useAuthStore.getState().setAuth('fake-token', mockUser, true);
    });

    act(() => {
      useAuthStore.getState().logout();
    });

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem('mew_token')).toBeNull();
    expect(sessionStorage.getItem('mew_token')).toBeNull();
  });
});