import { describe, it, expect, beforeEach } from 'vitest';
import { usePresenceStore } from './presenceStore';

describe('usePresenceStore', () => {
  beforeEach(() => {
    usePresenceStore.setState({ onlineStatus: {} });
  });

  it('sets initial state for users', () => {
    usePresenceStore.getState().setInitialState(['u1', 'u2']);
    expect(usePresenceStore.getState().onlineStatus).toEqual({
      u1: 'online',
      u2: 'online',
    });
  });

  it('updates and clears user status', () => {
    usePresenceStore.getState().updateUserStatus('u1', 'offline');
    expect(usePresenceStore.getState().onlineStatus.u1).toBe('offline');

    usePresenceStore.getState().clearOnlineStatus();
    expect(usePresenceStore.getState().onlineStatus).toEqual({});
  });
});

