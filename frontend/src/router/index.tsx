import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import AppLayout from '@/components/layout/AppLayout';

const WelcomePage = () => (
  <div className="p-4">
    <h1 className="text-lg">Welcome!</h1>
    <p>Please select a channel to start messaging.</p>
  </div>
);

const ProtectedRoute = () => {
  const token = useAuthStore((state) => state.token);
  return token ? <Outlet /> : <Navigate to="/login" replace />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/app" replace />
          },
          {
            path: 'app',
            element: <WelcomePage />
          }
          // Other app routes like /app/server/:serverId will go here
        ]
      }
    ]
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
]);
