import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('https://picsum.photos/*', () => {
    return new HttpResponse(new ArrayBuffer(0), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    });
  }),

  http.post('/api/auth/login-cookie', async ({ request }) => {
    const { email } = await request.json() as { email: string };
    if (email === 'test@example.com') {
      return HttpResponse.json({
        message: 'Login successful',
        user: { _id: 'user-1', username: 'Test User', email: 'test@example.com' },
      });
    }
  }),

  http.post('/api/auth/refresh-cookie', () => {
    return HttpResponse.json({ user: { _id: 'user-1', username: 'Test User', email: 'test@example.com' } });
  }),

  http.get('/api/users/@me', () => {
    return HttpResponse.json({
      _id: 'user-1',
      username: 'Test User',
      email: 'test@example.com',
    });
  }),

  http.get('/api/auth/config', () => {
    return HttpResponse.json({ allowUserRegistration: true });
  }),
];
