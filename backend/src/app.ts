import express from 'express';
import cors from 'cors';

import authRoutes from './api/auth/auth.routes';
import userRoutes from './api/user/user.routes';
import serverRoutes from './api/server/server.routes';
import channelRoutes from './api/channel/channel.routes';
import { categoryRootRoutes, categoryDetailRoutes } from './api/category/category.routes';

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/servers/:serverId/categories', categoryRootRoutes);
app.use('/api/categories', categoryDetailRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Error Handling Middleware
import { errorHandler } from './utils/errorHandler';
app.use(errorHandler);

export default app;
