
import React from 'react';
import { useAuthStore } from '../store';
import Layout from '../components/layout/Layout';
import { AuthScreen } from '../components/auth/Auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create a client
const queryClient = new QueryClient();

const App: React.FC = () => {
  const token = useAuthStore((state) => state.token);

  return (
    <QueryClientProvider client={queryClient}>
      {token ? <Layout /> : <AuthScreen />}
    </QueryClientProvider>
  );
};

export default App;