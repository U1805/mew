import { Server as SocketIOServer } from 'socket.io';
import http from 'http';

export class SocketManager {
  private io: SocketIOServer | null = null;

  init(server: http.Server) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });
    return this.io;
  }

  public getIO(): SocketIOServer {
    if (!this.io) {
      throw new Error('Socket.IO not initialized!');
    }
    return this.io;
  }

  broadcast(event: string, roomId: string, payload: any) {
    if (this.io) {
      this.io.to(roomId).emit(event, payload);
    }
  }

  broadcastToUser(userId: string, event: string, payload: any) {
    if (this.io) {
      // The user is in a room with their own ID
      this.io.to(userId).emit(event, payload);
    }
  }
}

export const socketManager = new SocketManager();
