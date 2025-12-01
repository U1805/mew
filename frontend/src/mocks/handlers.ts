import { http, HttpResponse } from 'msw';

const mockDb = {
  servers: [{ _id: 'server-1', name: 'Test Server', ownerId: 'user-1' }],
  categories: [
    { _id: 'category-1', name: 'General', serverId: 'server-1' },
    { _id: 'category-2', name: 'Voice', serverId: 'server-1' },
  ],
  channels: [
    { _id: 'channel-1', name: 'welcome', serverId: 'server-1', categoryId: 'category-1', type: 'GUILD_TEXT' },
    { _id: 'channel-2', name: 'lounge', serverId: 'server-1', categoryId: 'category-2', type: 'GUILD_TEXT' },
  ],
};

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

  http.get('http://localhost:3000/api/servers/:serverId', ({ params }) => {
    const server = mockDb.servers.find(s => s._id === params.serverId);
    return HttpResponse.json(server);
  }),

  http.get('http://localhost:3000/api/servers/:serverId/categories', ({ params }) => {
    const categories = mockDb.categories.filter(c => c.serverId === params.serverId);
    return HttpResponse.json(categories);
  }),

  http.get('http://localhost:3000/api/servers/:serverId/channels', ({ params }) => {
    const channels = mockDb.channels.filter(c => c.serverId === params.serverId);
    return HttpResponse.json(channels);
  }),

  http.patch('http://localhost:3000/api/categories/:categoryId', async ({ request, params }) => {
    const { name } = await request.json() as { name: string };
    const category = mockDb.categories.find(c => c._id === params.categoryId);
    if (category) {
      category.name = name;
    }
    return HttpResponse.json(category);
  }),

  http.delete('http://localhost:3000/api/categories/:categoryId', ({ params }) => {
    mockDb.categories = mockDb.categories.filter(c => c._id !== params.categoryId);
    // Also uncategorize channels
    mockDb.channels.forEach(ch => {
      if (ch.categoryId === params.categoryId) {
        ch.categoryId = undefined;
      }
    });
    return new HttpResponse(null, { status: 204 });
  }),
];