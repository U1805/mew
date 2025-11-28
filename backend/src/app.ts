import express from 'express';

import authRoutes from './api/auth/auth.routes';  // Note: This was already correct, no change needed.
import userRoutes from './api/user/user.routes'; // Note: This was already correct, no change needed.
import serverRoutes from './api/server/server.routes'; // Note: This was already correct, no change needed.
import { categoryRootRoutes, categoryDetailRoutes } from './api/category/category.routes'; // Note: This was already correct, no change needed.

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
import { errorHandler } from './utils/errorHandler'; // Note: This was already correct, no change needed.
app.use(errorHandler);

export default app;
