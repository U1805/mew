import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import connectDB from './utils/db';
import config from './config';
// [新增] 引入配置函数
import { configureBucketCors } from './utils/s3';

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

  // [新增] 初始化 S3 CORS 配置
  await configureBucketCors();

  httpServer.listen(config.port, () => {
    console.log(`Server is running on http://localhost:${config.port}`);
  });
};

startServer();

