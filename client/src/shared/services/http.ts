import axios from 'axios';
import { useAuthStore } from '../stores';

export const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

const shouldSkipRefresh = (url: string | undefined) => {
  if (!url) return false;
  return url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh') || url.includes('/auth/logout');
};

const refreshAccessToken = async (): Promise<string> => {
  // Use a separate request to avoid interceptor recursion.
  const res = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
  return res.data?.token as string;
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status as number | undefined;
    const originalConfig = error?.config as (typeof error.config & { _mewRetry?: boolean }) | undefined;

    if (!originalConfig || status !== 401 || originalConfig._mewRetry || shouldSkipRefresh(originalConfig.url)) {
      throw error;
    }

    originalConfig._mewRetry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const newToken = await refreshPromise;
      if (!newToken) throw error;

      const remember = !!localStorage.getItem('mew_token');
      const currentUser = useAuthStore.getState().user;
      useAuthStore.getState().setAuth(newToken, currentUser, remember);

      originalConfig.headers = originalConfig.headers || {};
      originalConfig.headers.Authorization = `Bearer ${newToken}`;
      return api(originalConfig);
    } catch {
      useAuthStore.getState().logout();
      throw error;
    }
  }
);

export default api;
