import { http, HttpResponse } from 'msw';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export const handlers = [
  // Mock for login endpoint
  http.post(`${apiBaseUrl}/auth/login`, async ({ request }) => {
    const { email } = await request.json() as Record<string, any>;

    // Simulate a failure for a specific email
    if (email === 'fail@example.com') {
      return new HttpResponse(JSON.stringify({ message: 'Invalid credentials' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Simulate a success
    return HttpResponse.json({
      token: 'mock-jwt-token',
    });
  }),

  // Mock for get user endpoint
  http.get(`${apiBaseUrl}/users/@me`, ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    if (authHeader !== 'Bearer mock-jwt-token') {
      return new HttpResponse(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
    }

    return HttpResponse.json({
      _id: 'user-123',
      email: 'test@example.com',
      username: 'TestUser',
      isBot: false,
    });
  }),
];
