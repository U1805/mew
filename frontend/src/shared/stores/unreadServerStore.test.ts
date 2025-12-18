import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { useUnreadStore } from './unreadStore';
import { useUnreadServerStore } from './unreadServerStore';
import { setNotifyServerStore } from './unreadNotifier';

describe('useUnreadServerStore', () => {
  beforeEach(() => {
    useUnreadStore.setState({ unreadChannelIds: new Set(), unreadMentionMessageIds: new Set() });
    useUnreadServerStore.setState({ unreadServerIds: new Set() });
    setNotifyServerStore(undefined);
  });

  it('tracks unread servers based on unread channels', () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(['channels', 's1'], [
      { _id: 'c1', name: 'c1' },
      { _id: 'c2', name: 'c2' },
    ]);
    queryClient.setQueryData(['channels', 's2'], [{ _id: 'c3', name: 'c3' }]);

    useUnreadServerStore.getState().initializeNotifier(queryClient, ['s1', 's2']);

    useUnreadStore.getState().addUnreadChannel('c1');
    expect(useUnreadServerStore.getState().unreadServerIds.has('s1')).toBe(true);

    useUnreadStore.getState().addUnreadChannel('c3');
    expect(useUnreadServerStore.getState().unreadServerIds.has('s2')).toBe(true);

    useUnreadStore.getState().removeUnreadChannel('c1');
    expect(useUnreadServerStore.getState().unreadServerIds.has('s1')).toBe(false);

    useUnreadStore.getState().addUnreadChannel('c2');
    useUnreadStore.getState().addUnreadChannel('c1');
    useUnreadStore.getState().removeUnreadChannel('c2');
    expect(useUnreadServerStore.getState().unreadServerIds.has('s1')).toBe(true);
  });
});

