import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUnreadStore } from './unreadStore';
import { setNotifyServerStore } from './unreadNotifier';

describe('useUnreadStore', () => {
  beforeEach(() => {
    useUnreadStore.setState({
      unreadChannelIds: new Set(),
      unreadMentionMessageIds: new Set(),
    });
    setNotifyServerStore(undefined);
  });

  it('adds/removes unread channels and notifies server store', () => {
    const notify = vi.fn();
    setNotifyServerStore(notify);

    useUnreadStore.getState().addUnreadChannel('c1');
    expect(useUnreadStore.getState().unreadChannelIds.has('c1')).toBe(true);
    expect(notify).toHaveBeenCalledWith('c1', 'add');

    notify.mockClear();
    useUnreadStore.getState().addUnreadChannel('c1');
    expect(notify).not.toHaveBeenCalled();

    useUnreadStore.getState().removeUnreadChannel('c1');
    expect(useUnreadStore.getState().unreadChannelIds.has('c1')).toBe(false);
    expect(notify).toHaveBeenCalledWith('c1', 'remove');
  });

  it('adds/removes mention ids without notifying server store', () => {
    const notify = vi.fn();
    setNotifyServerStore(notify);

    useUnreadStore.getState().addUnreadMention('m1');
    expect(useUnreadStore.getState().unreadMentionMessageIds.has('m1')).toBe(true);
    expect(notify).not.toHaveBeenCalled();

    useUnreadStore.getState().removeUnreadMention('m1');
    expect(useUnreadStore.getState().unreadMentionMessageIds.has('m1')).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});

