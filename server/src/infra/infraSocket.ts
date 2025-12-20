import { Server as SocketIOServer, Socket } from 'socket.io';
import config from '../config';
import { infraRegistry } from './infraRegistry';
import ServiceTypeModel from '../api/infra/serviceType.model';

const getHandshakeValue = (socket: Socket, key: string): string | undefined => {
  const authVal = (socket.handshake.auth as any)?.[key];
  if (typeof authVal === 'string') return authVal;
  const queryVal = (socket.handshake.query as any)?.[key];
  if (typeof queryVal === 'string') return queryVal;
  return undefined;
};

const getAdminSecret = (socket: Socket): string | undefined => {
  const headerVal = socket.handshake.headers?.['x-mew-admin-secret'];
  if (typeof headerVal === 'string') return headerVal;
  return getHandshakeValue(socket, 'adminSecret');
};

export const registerInfraNamespace = (io: SocketIOServer) => {
  const nsp = io.of('/infra');

  nsp.use((socket, next) => {
    if (!config.adminSecret) return next(new Error('Authentication error: Admin secret not configured'));

    const provided = getAdminSecret(socket);
    if (!provided || provided !== config.adminSecret) {
      return next(new Error('Authentication error: Invalid admin secret'));
    }

    const serviceType = getHandshakeValue(socket, 'serviceType');
    if (!serviceType) {
      return next(new Error('Authentication error: Missing serviceType'));
    }

    (socket.data as any).serviceType = serviceType;
    return next();
  });

  nsp.on('connection', async (socket) => {
    const serviceType = (socket.data as any).serviceType as string;
    socket.join(serviceType);
    infraRegistry.addConnection(serviceType, socket.id);

    await ServiceTypeModel.updateOne(
      { name: serviceType },
      { $set: { name: serviceType, lastSeenAt: new Date() } },
      { upsert: true }
    );

    socket.on('disconnect', () => {
      infraRegistry.removeConnection(serviceType, socket.id);
    });
  });

  return nsp;
};

