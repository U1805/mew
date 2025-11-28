import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
const AppLayout = () => <div><Outlet /></div>;
const DashboardPage = () => <div>Welcome to the App!</div>;

const ProtectedRoute = () => {
  const { token } = useAuthStore.getState();
  return token ? <AppLayout /> : <Navigate to="/login" replace />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/app" replace />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/app',
    element: <ProtectedRoute />,
    children: [
      {
        index: true,
        element: <DashboardPage />
      }
      // More app routes will go here
    ]
  }
]);
