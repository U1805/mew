export const ALL_PERMISSIONS = [
  // Server-Level Permissions
  'ADMINISTRATOR',
  'MANAGE_ROLES',
  'KICK_MEMBERS',
  'CREATE_INVITE',
  'MANAGE_SERVER',
  'MANAGE_WEBHOOKS',

  // Channel-Level Permissions
  'MANAGE_CHANNEL',
  'SEND_MESSAGES',
  'MANAGE_MESSAGES',
  'ADD_REACTIONS',
  'ATTACH_FILES',
  'MENTION_EVERYONE',
] as const;

export type Permission = typeof ALL_PERMISSIONS[number];
