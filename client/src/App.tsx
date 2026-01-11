import { Suspense, lazy, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getSocket } from './shared/services/socket';
import { useAuthStore, useModalStore, useUIStore } from './shared/stores';

const queryClient = new QueryClient();

const AuthScreen = lazy(() => import('./features/auth/components/AuthScreen').then(m => ({ default: m.AuthScreen })));
const Layout = lazy(() => import('./layout/Layout'));
const ModalManager = lazy(() => import('./layout/modals/ModalManager'));

const App = () => {
  const token = useAuthStore((state) => state.token);
  const openModal = useModalStore((state) => state.openModal);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/invite/')) {
        const code = path.split('/invite/')[1];
        if (code) {
            sessionStorage.setItem('mew_invite_code', code);
            window.history.replaceState({}, document.title, '/');
        }
    }

    if (token) {
        const pendingInvite = sessionStorage.getItem('mew_invite_code');
        if (pendingInvite) {
            sessionStorage.removeItem('mew_invite_code');
            setTimeout(() => {
                openModal('joinServer', { code: pendingInvite });
            }, 500);
        }
    }
  }, [token, openModal]);

  useEffect(() => {
    if (!token) return;

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
  }, [token]);

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        {token ? <Layout /> : <AuthScreen />}
      </Suspense>
      <Suspense fallback={null}>
        <ModalManager />
      </Suspense>
    </QueryClientProvider>
  );
};

export default App;
