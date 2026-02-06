import { Suspense, lazy, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getSocket } from './shared/services/socket';
import { useAuthStore, useModalStore, useUIStore } from './shared/stores';
import { parseChannelsPathname } from './shared/router/channelsRoute';
import { parseAuthPathname } from './shared/router/authRoute';
import { parseSettingsPathname } from './shared/router/settingsRoute';
import { addNavigationListener, safeReplaceState } from './shared/router/history';

const queryClient = new QueryClient();

const AuthScreen = lazy(() => import('./features/auth/components/AuthScreen').then(m => ({ default: m.AuthScreen })));
const Layout = lazy(() => import('./layout/Layout'));
const ModalManager = lazy(() => import('./layout/modals/ModalManager'));

const App = () => {
  const authStatus = useAuthStore((state) => state.status);
  const openModal = useModalStore((state) => state.openModal);

  const applyRoute = () => {
    const statusNow = useAuthStore.getState().status;
    const authedNow = statusNow === 'authenticated';
    const path = window.location.pathname;

    if (path.length > 1 && path.endsWith('/')) {
      safeReplaceState(path.replace(/\/+$/g, ''));
      return;
    }

    if (path === '/') {
      safeReplaceState(authedNow ? '/channels/@me' : '/login');
      return;
    }

    if (path.startsWith('/invite/')) {
      const code = path.split('/invite/')[1];
      if (code) sessionStorage.setItem('mew_invite_code', code);
      sessionStorage.setItem('mew_post_login_path', '/channels/@me');
      safeReplaceState(authedNow ? '/channels/@me' : '/login');
      return;
    }

    const authMode = parseAuthPathname(path);
    if (authMode) {
      useUIStore.getState().hydrateSettingsClosedFromRoute();

      if (authedNow) {
        const desired = sessionStorage.getItem('mew_post_login_path') || '/channels/@me';
        sessionStorage.removeItem('mew_post_login_path');
        safeReplaceState(desired);
      }
      return;
    }

    const settingsTab = parseSettingsPathname(path);
    if (settingsTab) {
      if (!authedNow) {
        sessionStorage.setItem('mew_post_login_path', path);
        safeReplaceState('/login');
        return;
      }

      useUIStore.getState().hydrateSettingsFromRoute(settingsTab);
      return;
    }

    useUIStore.getState().hydrateSettingsClosedFromRoute();

    const channelRoute = parseChannelsPathname(path);
    if (channelRoute) {
      if (!authedNow) {
        sessionStorage.setItem('mew_post_login_path', path);
        safeReplaceState('/login');
        return;
      }

      useUIStore.getState().hydrateFromRoute(channelRoute.serverId, channelRoute.channelId);
      return;
    }

    safeReplaceState(authedNow ? '/channels/@me' : '/login');
  };

  useEffect(() => {
    // Bootstrap auth session from cookies (access token + refresh token).
    void useAuthStore.getState().hydrate().finally(() => {
      applyRoute();
    });

    applyRoute();
    return addNavigationListener(applyRoute);
  }, []);

  useEffect(() => {
    applyRoute();
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      queryClient.clear();
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
        const pendingInvite = sessionStorage.getItem('mew_invite_code');
        if (pendingInvite) {
            sessionStorage.removeItem('mew_invite_code');
            setTimeout(() => {
                openModal('joinServer', { code: pendingInvite });
            }, 500);
        }
    }
  }, [authStatus, openModal]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    const socket = getSocket();
    if (!socket) return;

    const handleServerKick = ({ serverId: kickedServerId }: { serverId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });

      // NOTE: We access the store directly as we are outside a component's render cycle
      if (useUIStore.getState().currentServerId === kickedServerId) {
        useUIStore.getState().setCurrentServer(null);
      }
    };

    socket.on('SERVER_KICK', handleServerKick);

    return () => {
      socket.off('SERVER_KICK', handleServerKick);
    };
  }, [authStatus]);

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        {authStatus === 'unknown' ? null : authStatus === 'authenticated' ? <Layout /> : <AuthScreen />}
      </Suspense>
      <Suspense fallback={null}>
        <ModalManager />
      </Suspense>
    </QueryClientProvider>
  );
};

export default App;
