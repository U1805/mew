import { Server } from 'socket.io';

let io: Server;

export const initSocket = (socketIo: Server) => {
  io = socketIo;
};

export const broadcastEvent = (room: string, event: string, data: any) => {
  if (io) {
    io.to(room).emit(event, data);
  }
};
