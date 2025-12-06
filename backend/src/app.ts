import express from 'express';
import cors from 'cors';

import authRoutes from './api/auth/auth.routes';
import userRoutes from './api/user/user.routes';
import serverRoutes from './api/server/server.routes';
import roleRoutes from './api/role/role.routes';
import { categoryRootRoutes, categoryDetailRoutes } from './api/category/category.routes';
import invitePublicRoutes from './api/invite/public.routes';
import dmChannelRoutes from './api/channel/dm.routes';


const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/servers/:serverId/roles', roleRoutes);
app.use('/api/channels', dmChannelRoutes);
app.use('/api/servers/:serverId/categories', categoryRootRoutes);
app.use('/api/categories', categoryDetailRoutes);
app.use('/api/invites', invitePublicRoutes);


// Public webhook execution route
import publicWebhookRoutes from './api/webhook/public.routes';
app.use('/api/webhooks', publicWebhookRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Error Handling Middleware
import { errorHandler } from './utils/errorHandler';
app.use(errorHandler);

export default app;
