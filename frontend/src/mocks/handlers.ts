import { http, HttpResponse } from 'msw';

export const handlers = [
  // 模拟登录成功
  http.post('http://localhost:3000/api/auth/login', async ({ request }) => {
    const { email } = await request.json() as { email: string };
    if (email === 'test@example.com') {
      return HttpResponse.json({ token: 'fake-token' });
    }
  }),

  // 模拟获取用户信息
  http.get('http://localhost:3000/api/users/@me', () => {
    return HttpResponse.json({
      _id: 'user-1',
      username: 'Test User',
      email: 'test@example.com',
    });
  }),
];