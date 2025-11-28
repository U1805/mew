import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';
import { disconnectAndResetSocket } from '../lib/socket';

// This mock now correctly handles the hoisting behavior by defining the mock logic
// inside the factory function, which is executed lazily.
vi.mock('@/store/authStore', () => {
  const state = { token: 'fake-token', user: { username: 'test-user' } };
  const mockUseAuthStore = (selector) => selector ? selector(state) : state;
  mockUseAuthStore.getState = () => state;
  return {
    useAuthStore: mockUseAuthStore,
  };
});

// After each test, disconnect and reset the global socket instance to prevent test pollution.
afterEach(() => {
    disconnectAndResetSocket();
});
