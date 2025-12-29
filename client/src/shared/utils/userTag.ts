import type { User } from '../types';

export const formatUserTag = (user?: Pick<User, 'username' | 'discriminator'> | null) => {
  if (!user) return '';
  const username = user.username || '';
  const disc = user.discriminator;
  if (typeof disc === 'string' && /^\d{4}$/.test(disc)) return `${username}#${disc}`;
  return username;
};

