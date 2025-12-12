import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthScreen } from './features/auth/components/AuthScreen';
import Layout from './layout/Layout';
import { getSocket } from './shared/services/socket';
import { useAuthStore, useModalStore, useUIStore } from './shared/stores';

const queryClient = new QueryClient();

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
  }, [token, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {token ? <Layout /> : <AuthScreen />}
    </QueryClientProvider>
  );
};

export default App;
