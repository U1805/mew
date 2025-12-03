/**
 * @file Manages real-time user presence, tracking online users.
 */

// Using a Map to store online users for efficient additions, removals, and lookups.
// The key is the userId (string), and the value is the status ('online').
export const onlineUsers = new Map<string, 'online'>();

/**
 * Adds a user to the online users list.
 * @param userId - The ID of the user to add.
 */
export const addUserOnline = (userId: string) => {
  onlineUsers.set(userId, 'online');
};

/**
 * Removes a user from the online users list.
 * @param userId - The ID of the user to remove.
 */
export const removeUserOnline = (userId: string) => {
  onlineUsers.delete(userId);
};

/**
 * Retrieves an array of all currently online user IDs.
 * @returns An array of user IDs.
 */
export const getOnlineUserIds = (): string[] => {
  return Array.from(onlineUsers.keys());
};
