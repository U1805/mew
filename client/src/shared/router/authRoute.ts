import { safePushState, safeReplaceState } from './history';

export type AuthMode = 'login' | 'register';

export const buildAuthPathname = (mode: AuthMode): string => (mode === 'register' ? '/register' : '/login');

export const parseAuthPathname = (pathname: string): AuthMode | null => {
  if (pathname === '/login' || pathname === '/auth/login') return 'login';
  if (pathname === '/register' || pathname === '/auth/register') return 'register';
  return null;
};

export const navigateAuth = (mode: AuthMode, opts?: { replace?: boolean }) => {
  const path = buildAuthPathname(mode);
  if (opts?.replace) safeReplaceState(path);
  else safePushState(path);
};

export { safePushState, safeReplaceState };

