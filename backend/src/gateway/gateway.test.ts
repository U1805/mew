import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import request from 'supertest';
import app from '../app';
import { SocketManager, socketManager as appSocketManager } from '../gateway/events';
import { registerConnectionHandlers } from './handlers';

// Mock the application's socketManager to intercept broadcasts
vi.mock('../gateway/events', async (importOriginal) => {
  const original = await importOriginal() as any;
  return {
    SocketManager: original.SocketManager, // Explicitly pass through the class
    socketManager: { // Mock the singleton instance
      init: vi.fn(),
      getIO: vi.fn(),
      broadcast: vi.fn(),
    },
  };
});
import { ChannelType } from '../api/channel/channel.model';
import Message from '../api/message/message.model';
import ServerMemberModel from '../api/member/member.model';
import { authMiddleware } from './middleware';

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
  let token1: string, token2: string, userId2: string;
  let serverId: string;
  let channel1Id: string, channel2Id: string;

  beforeEach(async () => {
    httpServer = createServer(app);

    // Create a real SocketManager for the test environment
    const testSocketManager = new SocketManager();
    io = testSocketManager.init(httpServer);

    // Make the mocked broadcast function call the real test instance's broadcast
    (appSocketManager.broadcast as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, roomId: string, payload: any) => {
        testSocketManager.broadcast(event, roomId, payload);
      }
    );

    // Use the real auth middleware and connection handlers
    io.use(authMiddleware);
    io.on('connection', (socket) => {
        registerConnectionHandlers(io, socket)
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
    userId2 = loginRes2.body.user._id;

    // Server 1 for user1
    const server1Res = await request(app).post('/api/servers').set('Authorization', `Bearer ${token1}`).send({ name: 'Socket Test Server 1' });
    serverId = server1Res.body._id; // This is the server under test

    const channel1Res = await request(app).post(`/api/servers/${serverId}/channels`).set('Authorization', `Bearer ${token1}`).send({ name: 'Channel One', type: ChannelType.GUILD_TEXT });
    channel1Id = channel1Res.body._id;

    // Server 2 for user2, to ensure they are in a different room
    const server2Res = await request(app).post('/api/servers').set('Authorization', `Bearer ${token2}`).send({ name: 'Socket Test Server 2' });
    const server2Id = server2Res.body._id;
    await request(app).post(`/api/servers/${server2Id}/channels`).set('Authorization', `Bearer ${token2}`).send({ name: 'Channel Two', type: ChannelType.GUILD_TEXT });
  });

  afterEach(() => {
    client1?.disconnect();
    client2?.disconnect();
    io?.close();
    httpServer?.close();
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

    const client2DoesNotReceiveMessage = new Promise<void>((resolve, reject) => {
      client2.on('MESSAGE_CREATE', () => {
        reject(new Error('Client 2 should not have received this message'));
      });
      // If the message is not received after a short delay, resolve the promise.
      setTimeout(resolve, 500);
    });

    // Wait for sockets to connect
    await new Promise<void>(resolve => client1.on('connect', () => resolve()));
    await new Promise<void>(resolve => client2.on('connect', () => resolve()));

    // client now automatically joins rooms on connection via `joinUserRooms`

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
