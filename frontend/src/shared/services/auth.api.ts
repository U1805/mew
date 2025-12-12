import api from './http';

export interface LoginResponse {
  token: string;
}

export const authApi = {
  login: (data: any) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  getMe: () => api.get('/users/@me'),
};

export default authApi;

