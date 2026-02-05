import api from './http';

export interface LoginResponse {
  token: string;
}

export const authApi = {
  login: (data: any) => api.post('/auth/login-cookie', data),
  register: (data: any) => api.post('/auth/register-cookie', data),
  getConfig: () => api.get('/auth/config'),
  getMe: () => api.get('/users/@me'),
  refresh: () => api.post('/auth/refresh-cookie', {}),
  logout: () => api.post('/auth/logout', {}),
};

export default authApi;

