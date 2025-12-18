import express from 'express';
import cors from 'cors';

import authRoutes from './api/auth/auth.routes';
import userRoutes from './api/user/user.routes';
import serverRoutes from './api/server/server.routes';
import roleRoutes from './api/role/role.routes';
import { categoryRootRoutes, categoryDetailRoutes } from './api/category/category.routes';
import invitePublicRoutes from './api/invite/public.routes';
import dmChannelRoutes from './api/channel/dm.routes';
import uploadRoutes from './api/upload/upload.routes';
import publicWebhookRoutes from './api/webhook/public.routes';
import infraRoutes from './api/infra/infra.routes';
import botBootstrapRoutes from './api/bot/bot.bootstrap.routes';
import { errorHandler } from './utils/errorHandler';

const app = express();

app.set('trust proxy', true);
app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/servers/:serverId/roles', roleRoutes);
app.use('/api/channels', dmChannelRoutes);
app.use('/api/servers/:serverId/categories', categoryRootRoutes);
app.use('/api/categories', categoryDetailRoutes);
app.use('/api/channels/:channelId/uploads', uploadRoutes);
app.use('/api/invites', invitePublicRoutes);
app.use('/api/webhooks', publicWebhookRoutes);
app.use('/api/bots', botBootstrapRoutes);
app.use('/api/infra', infraRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

app.use(errorHandler);

export default app;
