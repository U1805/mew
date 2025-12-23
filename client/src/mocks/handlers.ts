import { http, HttpResponse } from 'msw';

const API_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export const handlers = [
  http.get('https://picsum.photos/*', () => {
    return new HttpResponse(new ArrayBuffer(0), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    });
  }),

  http.post(`${API_URL}/auth/login`, async ({ request }) => {
    const { email } = await request.json() as { email: string };
    if (email === 'test@example.com') {
      return HttpResponse.json({
        message: 'Login successful',
        token: 'fake-token',
        user: { _id: 'user-1', username: 'Test User', email: 'test@example.com' },
      });
    }
  }),

  http.get(`${API_URL}/users/@me`, () => {
    return HttpResponse.json({
      _id: 'user-1',
      username: 'Test User',
      email: 'test@example.com',
    });
  }),

  http.get(`${API_URL}/auth/config`, () => {
    return HttpResponse.json({ allowUserRegistration: true });
  }),
];
