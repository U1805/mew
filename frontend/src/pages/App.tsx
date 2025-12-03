
import React, { useEffect } from 'react';
import { useAuthStore, useModalStore } from '../store';
import Layout from '../components/layout/Layout';
import { AuthScreen } from '../components/auth/Auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

  return (
    <QueryClientProvider client={queryClient}>
      {token ? <Layout /> : <AuthScreen />}
    </QueryClientProvider>
  );
};

export default App;
