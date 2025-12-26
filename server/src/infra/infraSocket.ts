import { Server as SocketIOServer, Socket } from 'socket.io';
import crypto from 'crypto';
import config from '../config';
import { infraRegistry } from './infraRegistry';
import ServiceTypeModel from '../api/infra/serviceType.model';
import { syncBotUsersPresenceForServiceType } from './botPresenceSync';

const RESERVED_SERVICE_TYPES = new Set(['sdk']);

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

const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

export const registerInfraNamespace = (io: SocketIOServer) => {
  const nsp = io.of('/infra');

  nsp.use((socket, next) => {
    if (!config.adminSecret) return next(new Error('Authentication error: Admin secret not configured'));

    const provided = getAdminSecret(socket);
    if (!provided || !safeEqual(provided, config.adminSecret)) {
      return next(new Error('Authentication error: Invalid admin secret'));
    }

    const serviceType = getHandshakeValue(socket, 'serviceType');
    if (!serviceType) {
      return next(new Error('Authentication error: Missing serviceType'));
    }
    if (RESERVED_SERVICE_TYPES.has(serviceType.trim())) {
      return next(new Error(`Authentication error: Reserved serviceType: ${serviceType}`));
    }

    (socket.data as any).serviceType = serviceType;
    return next();
  });

  nsp.on('connection', async (socket) => {
    const serviceType = (socket.data as any).serviceType as string;
    socket.join(serviceType);

    const wasOnline = infraRegistry.isOnline(serviceType);
    infraRegistry.addConnection(serviceType, socket.id);
    if (!wasOnline && infraRegistry.isOnline(serviceType)) {
      await syncBotUsersPresenceForServiceType(serviceType, 'online');
    }

    await ServiceTypeModel.updateOne(
      { name: serviceType },
      {
        $set: { name: serviceType, lastSeenAt: new Date() },
        $setOnInsert: { serverName: serviceType, icon: '', description: '', configTemplate: '' },
      },
      { upsert: true }
    );

    socket.on('disconnect', () => {
      const wasOnline = infraRegistry.isOnline(serviceType);
      infraRegistry.removeConnection(serviceType, socket.id);
      if (wasOnline && !infraRegistry.isOnline(serviceType)) {
        void syncBotUsersPresenceForServiceType(serviceType, 'offline');
      }
    });
  });

  return nsp;
};

