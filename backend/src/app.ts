import express from 'express';

import authRoutes from './api/auth/auth.routes';
import userRoutes from './api/user/user.routes';
import serverRoutes from './api/server/server.routes';

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

export default app;
