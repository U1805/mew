import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import request from 'supertest';
import app from '../app.js';
import { initSocket } from '../gateway/events.js';
import { ChannelType } from '../api/channel/channel.model.js';
import Message from '../api/message/message.model.js';
import { authMiddleware } from './middleware.js';

const createTestClient = (port: number, token: string): ClientSocket => {
  return Client(`http://localhost:${port}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true, // Ensures a new connection for each client
  });
};

describe('WebSocket Gateway', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let port: number;
  let client1: ClientSocket, client2: ClientSocket;
  let token1: string, token2: string;
  let serverId: string;
  let channel1Id: string, channel2Id: string;

  beforeAll(async () => {
    httpServer = createServer(app);
    io = new Server(httpServer);
    initSocket(io); // Initialize the event broadcaster with our test server

    io.use(authMiddleware);
    io.on('connection', (socket) => {
      socket.on('join', (room) => socket.join(room));
    });

    await new Promise<void>((resolve) => httpServer.listen(resolve));
    port = (httpServer.address() as any).port;

    const user1Data = { email: 'socket-user1@example.com', username: 'socketuser1', password: 'password123' };
    const user2Data = { email: 'socket-user2@example.com', username: 'socketuser2', password: 'password123' };

    await request(app).post('/api/auth/register').send(user1Data);
    const loginRes1 = await request(app).post('/api/auth/login').send({ email: user1Data.email, password: user1Data.password });
    token1 = loginRes1.body.token;

    await request(app).post('/api/auth/register').send(user2Data);
    const loginRes2 = await request(app).post('/api/auth/login').send({ email: user2Data.email, password: user2Data.password });
    token2 = loginRes2.body.token;

    const serverRes = await request(app).post('/api/servers').set('Authorization', `Bearer ${token1}`).send({ name: 'Socket Test' });
    serverId = serverRes.body._id;

    const ch1Res = await request(app).post(`/api/servers/${serverId}/channels`).set('Authorization', `Bearer ${token1}`).send({ name: 'Channel One', type: ChannelType.GUILD_TEXT });
    channel1Id = ch1Res.body._id;

    const ch2Res = await request(app).post(`/api/servers/${serverId}/channels`).set('Authorization', `Bearer ${token1}`).send({ name: 'Channel Two', type: ChannelType.GUILD_TEXT });
    channel2Id = ch2Res.body._id;
  });

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  afterEach(() => {
    client1?.disconnect();
    client2?.disconnect();
  });

  it('should reject connection for invalid token', async () => {
    const promise = new Promise<void>((resolve, reject) => {
      const badClient = Client(`http://localhost:${port}`, { auth: { token: 'bad-token' } });
      badClient.on('connect_error', (err) => {
        expect(err.message).toBe('Authentication error: Invalid token');
        badClient.close();
        resolve();
      });
      setTimeout(() => reject(new Error('Test timed out waiting for connect_error')), 2000);
    });
    await promise;
  });

  it('should broadcast a message only to clients in the correct room', async () => {
    client1 = createTestClient(port, token1);
    client2 = createTestClient(port, token2);

    const client1ReceivesMessage = new Promise<void>((resolve, reject) => {
      client1.on('MESSAGE_CREATE', (message) => {
        try {
          expect(message.content).toBe('Hello from channel one');
          expect(message.channelId).toBe(channel1Id);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    const client2DoesNotReceiveMessage = new Promise<void>((resolve) => {
      client2.on('MESSAGE_CREATE', () => { throw new Error('Client 2 should not have received this message'); });
      setTimeout(resolve, 500); // Wait 500ms and assume no message is received
    });

    // Wait for sockets to connect
    await new Promise<void>(resolve => client1.on('connect', () => resolve()));
    await new Promise<void>(resolve => client2.on('connect', () => resolve()));

    // Join rooms
    client1.emit('join', channel1Id);
    client2.emit('join', channel2Id);

    // API call to create a message, which triggers the broadcast
    await request(app)
      .post(`/api/servers/${serverId}/channels/${channel1Id}/messages`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ content: 'Hello from channel one' });

    // Await all test promises
    await Promise.all([client1ReceivesMessage, client2DoesNotReceiveMessage]);

    const savedMsg = await Message.findOne({ channelId: channel1Id, content: 'Hello from channel one' });
    expect(savedMsg).toBeTruthy();
  });
});
