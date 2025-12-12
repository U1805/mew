import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthScreen } from './features/auth/components/AuthScreen';
import Layout from './layout/Layout';
import { getSocket } from './shared/services/socket';
import { useAuthStore, useModalStore, useUIStore } from './shared/stores';

// Create a client
const queryClient = new QueryClient();

const App: React.FC = () => {
  const token = useAuthStore((state) => state.token);
  const openModal = useModalStore((state) => state.openModal);

  useEffect(() => {
    // Check for invite code in URL path
    const path = window.location.pathname;
    if (path.startsWith('/invite/')) {
        const code = path.split('/invite/')[1];
        if (code) {
            // Store temporarily to handle after auth
            sessionStorage.setItem('mew_invite_code', code);
            // Clean URL to avoid loops or visual clutter
            window.history.replaceState({}, document.title, '/');
        }
    }

    // If authenticated and invite code exists, pop modal
    if (token) {
        const pendingInvite = sessionStorage.getItem('mew_invite_code');
        if (pendingInvite) {
            sessionStorage.removeItem('mew_invite_code');
            // Small delay to ensure layout is ready
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
      // Invalidate servers query to refetch the list
      queryClient.invalidateQueries({ queryKey: ['servers'] });

      // If the user was viewing the kicked server, navigate them away
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
