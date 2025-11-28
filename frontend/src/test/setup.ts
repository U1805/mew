import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Create a robust mock for the Zustand store that supports both
// hook usage and direct .getState() calls.
const state = { token: 'fake-token', user: { username: 'test-user' } };
const mockUseAuthStore = (selector) => selector ? selector(state) : state;
mockUseAuthStore.getState = () => state;

vi.mock('@/store/authStore', () => ({
  useAuthStore: mockUseAuthStore,
}));
