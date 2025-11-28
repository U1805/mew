import express from 'express';

import authRoutes from './api/auth/auth.routes.js';
import userRoutes from './api/user/user.routes.js';
import serverRoutes from './api/server/server.routes.js';
import { categoryRootRoutes, categoryDetailRoutes } from './api/category/category.routes.js';

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/servers/:serverId/categories', categoryRootRoutes);
app.use('/api/categories', categoryDetailRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Error Handling Middleware
import { errorHandler } from './utils/errorHandler.js';
app.use(errorHandler);

export default app;
