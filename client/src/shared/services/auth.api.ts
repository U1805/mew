import api from './http';

export interface LoginResponse {
  token: string;
}

let csrfReady = false;
let csrfInflight: Promise<void> | null = null;

const ensureCsrf = async () => {
  if (csrfReady) return;
  if (!csrfInflight) {
    csrfInflight = api
      .get('/auth/csrf')
      .then(() => {
        csrfReady = true;
      })
      .finally(() => {
        csrfInflight = null;
      });
  }
  await csrfInflight;
};

export const authApi = {
  login: async (data: any) => {
    await ensureCsrf();
    return api.post('/auth/login-cookie', data);
  },
  register: async (data: any) => {
    await ensureCsrf();
    return api.post('/auth/register-cookie', data);
  },
  getConfig: () => api.get('/auth/config'),
  getMe: () => api.get('/users/@me'),
  refresh: async () => {
    await ensureCsrf();
    return api.post('/auth/refresh-cookie', {});
  },
  logout: async () => {
    await ensureCsrf();
    return api.post('/auth/logout', {});
  },
};

export default authApi;

