import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import connectDB from './utils/db';
import config from './config';

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Be more specific in production
    methods: ['GET', 'POST'],
  },
});

import { authMiddleware } from './gateway/middleware';

io.use(authMiddleware);

io.on('connection', (socket) => {
  console.log('Authenticated user connected:', socket.id, 'as', socket.user?.username);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const startServer = async () => {
  await connectDB();

  httpServer.listen(config.port, () => {
    console.log(`Server is running on http://localhost:${config.port}`);
  });
};

startServer();

