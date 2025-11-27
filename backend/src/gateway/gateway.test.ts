import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import app from '../app';
import request from 'supertest';
import { ChannelType } from '../models/Channel';
import Message from '../models/Message';
import { authMiddleware } from './middleware';
import { registerConnectionHandlers } from './handlers';

describe('WebSocket Gateway', () => {
  let httpServer: ReturnType<typeof createServer>;
  let clientSocket: ClientSocket;
  let token: string;
  let channelId: string;

  beforeAll(async () => {
    httpServer = createServer(app);
    const io = new Server(httpServer);
    
    await new Promise<void>(resolve => httpServer.listen(resolve));

    const port = (httpServer.address() as any).port;

     const userData = { email: 'socket-test@example.com', username: 'sockettest', password: 'password123' };
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = loginRes.body.token;

    const serverRes = await request(app).post('/api/servers').set('Authorization', `Bearer ${token}`).send({ name: 'Socket Test' });
    const channelRes = await request(app).post(`/api/servers/${serverRes.body._id}/channels`).set('Authorization', `Bearer ${token}`).send({ name: 'socket-channel', type: ChannelType.GUILD_TEXT });
    channelId = channelRes.body._id;

    // Apply middlewares and handlers to the test Io Server
    io.use(authMiddleware);
    io.on('connection', (socket) => {
      registerConnectionHandlers(io, socket);
    });

    clientSocket = Client(`http://localhost:${port}`, { auth: { token } });
  });

  afterAll(() => {
    clientSocket.close();
    httpServer.close();
  });

  it('should create a message, persist it, and broadcast to room', (done) => {
    const messageData = { channelId, content: 'Hello WebSocket' };

    clientSocket.on('message/create', async (message) => {
      try {
        // 1. Verify broadcast content
        expect(message.content).toBe(messageData.content);
        expect(message.channelId).toBe(channelId);
        expect(message.authorId.username).toBe('sockettest'); // Check that author is populated

        // 2. Verify database persistence
        const savedMsg = await Message.findById(message._id);
        expect(savedMsg).toBeTruthy();
        expect(savedMsg?.content).toBe(messageData.content);

        done();
      } catch (error) {
        done(error);
      }
    });

    clientSocket.emit('message/create', messageData);
  });
});
