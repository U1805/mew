import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import connectDB from './utils/db';
import config from './config';

const httpServer = http.createServer(app);

import { authMiddleware } from './gateway/middleware';
import { registerConnectionHandlers } from './gateway/handlers';
import { socketManager } from './gateway/events';

const io = socketManager.init(httpServer);
socketManager.getIO().use(authMiddleware);

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

