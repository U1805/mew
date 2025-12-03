import { describe, it, expect, beforeEach } from 'vitest';
import {
  addUserOnline,
  getOnlineUserIds,
  onlineUsers,
  removeUserOnline,
} from './presence.service';

describe('Presence Service', () => {
  // Clear the map before each test to ensure a clean state
  beforeEach(() => {
    onlineUsers.clear();
  });

  it('should be initially empty', () => {
    expect(getOnlineUserIds()).toEqual([]);
    expect(onlineUsers.size).toBe(0);
  });

  it('should add a user to the online list', () => {
    addUserOnline('user1');
    expect(onlineUsers.has('user1')).toBe(true);
    expect(onlineUsers.get('user1')).toBe('online');
    expect(onlineUsers.size).toBe(1);
  });

  it('adding the same user twice should not create duplicates', () => {
    addUserOnline('user1');
    addUserOnline('user1');
    expect(onlineUsers.size).toBe(1);
    expect(getOnlineUserIds()).toEqual(['user1']);
  });

  it('should remove a user from the online list', () => {
    addUserOnline('user1');
    addUserOnline('user2');
    removeUserOnline('user1');

    expect(onlineUsers.has('user1')).toBe(false);
    expect(onlineUsers.has('user2')).toBe(true);
    expect(onlineUsers.size).toBe(1);
  });

  it('removing a non-existent user should do nothing', () => {
    addUserOnline('user1');
    removeUserOnline('user2');
    expect(onlineUsers.size).toBe(1);
    expect(onlineUsers.has('user1')).toBe(true);
  });

  it('should return an array of online user IDs', () => {
    addUserOnline('user1');
    addUserOnline('user2');
    addUserOnline('user3');

    const userIds = getOnlineUserIds();
    // The order is not guaranteed with Map.keys(), so we sort for a stable comparison
    expect(userIds.sort()).toEqual(['user1', 'user2', 'user3'].sort());
  });
});
