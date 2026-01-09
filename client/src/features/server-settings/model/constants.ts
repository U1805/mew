export const PERMISSION_GROUPS = [
  {
    group: 'General Server Permissions',
    perms: [
      { id: 'ADMINISTRATOR', name: 'Administrator', desc: 'Grants all permissions and bypasses all permission checks.' },
      { id: 'MANAGE_CHANNEL', name: 'Manage Channels', desc: 'Allows members to create, edit, or delete channels.' },
      { id: 'MANAGE_ROLES', name: 'Manage Roles', desc: 'Allows members to create new roles and edit/delete roles lower than their highest role.' },
      { id: 'MANAGE_SERVER', name: 'Manage Server', desc: "Allows members to change this server's name or move its region." },
      { id: 'MANAGE_STICKERS', name: 'Manage Stickers', desc: 'Allows members to upload, edit, or delete stickers in this server.' },
    ],
  },
  {
    group: 'Membership Permissions',
    perms: [
      { id: 'CREATE_INVITE', name: 'Create Invite', desc: 'Allows members to invite new people to this server.' },
      { id: 'CHANGE_NICKNAME', name: 'Change Nickname', desc: 'Allows members to change their own nickname.' },
      { id: 'MANAGE_NICKNAMES', name: 'Manage Nicknames', desc: "Allows members to change other members' nicknames." },
      { id: 'KICK_MEMBERS', name: 'Kick Members', desc: 'Allows members to remove other members from this server.' },
    ],
  },
  {
    group: 'Text Channel Permissions',
    perms: [
      { id: 'SEND_MESSAGES', name: 'Send Messages', desc: 'Allows members to send messages in text channels.' },
      { id: 'EMBED_LINKS', name: 'Embed Links', desc: 'Allows links that are pasted into the chat window to embed.' },
      { id: 'ATTACH_FILES', name: 'Attach Files', desc: 'Allows members to upload files or media in the chat.' },
      { id: 'ADD_REACTIONS', name: 'Add Reactions', desc: 'Allows members to add new emoji reactions to a message.' },
      { id: 'MENTION_EVERYONE', name: 'Mention @everyone', desc: 'Allows members to use @everyone or @here.' },
      { id: 'MANAGE_MESSAGES', name: 'Manage Messages', desc: 'Allows members to delete messages by other members or pin any message.' },
      { id: 'READ_MESSAGE_HISTORY', name: 'Read Message History', desc: 'Allows members to read previous messages sent in channels.' },
    ],
  },
] as const;

export const PRESET_COLORS = [
  '#99AAB5',
  '#1ABC9C',
  '#2ECC71',
  '#3498DB',
  '#9B59B6',
  '#E91E63',
  '#F1C40F',
  '#E67E22',
  '#E74C3C',
  '#95A5A6',
  '#607D8B',
] as const;
