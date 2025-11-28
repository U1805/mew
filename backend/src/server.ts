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
import { registerConnectionHandlers } from './gateway/handlers';
import { initSocket } from './gateway/events';

initSocket(io);
io.use(authMiddleware);

io.on('connection', (socket) => {
  registerConnectionHandlers(io, socket);
});

const startServer = async () => {
  await connectDB();

  httpServer.listen(config.port, () => {
    console.log(`Server is running on http://localhost:${config.port}`);
  });
};

startServer();

