import { Socket } from 'socket.io';
import Channel from '../api/channel/channel.model';
import ServerMember from '../api/member/member.model';
import Server from '../api/server/server.model';
import Role from '../api/role/role.model';
import { calculateEffectivePermissions } from '../utils/permission.service';
import { socketManager } from './events';

const MANAGED_ROOMS_KEY = 'mewManagedRooms';

const collectAllowedRooms = async (userId: string): Promise<Set<string>> => {
  const dmChannels = await Channel.find({ recipients: userId }).select('_id').lean();

  const memberships = await ServerMember.find({ userId }).lean();
  const memberServerIds = memberships.map((m: any) => m.serverId).filter(Boolean);
  const serverIds = memberServerIds.map((id: any) => id.toString());

  const [servers, roles, channels] = await Promise.all([
    Server.find({ _id: { $in: memberServerIds } as any }).select('_id everyoneRoleId').lean(),
    Role.find({ serverId: { $in: memberServerIds } as any }).select('_id serverId permissions position').lean(),
    Channel.find({ serverId: { $in: memberServerIds } as any, type: { $in: ['GUILD_TEXT', 'GUILD_WEB'] } })
      .select('_id serverId type permissionOverrides')
      .lean(),
  ]);

  const serverById = new Map<string, any>(servers.map((s: any) => [s._id.toString(), s]));
  const rolesByServerId = new Map<string, any[]>();
  roles.forEach((r: any) => {
    const sid = r.serverId?.toString?.();
    if (!sid) return;
    const arr = rolesByServerId.get(sid) || [];
    arr.push(r);
    rolesByServerId.set(sid, arr);
  });

  const channelsByServerId = new Map<string, any[]>();
  channels.forEach((c: any) => {
    const sid = c.serverId?.toString?.();
    if (!sid) return;
    const arr = channelsByServerId.get(sid) || [];
    arr.push(c);
    channelsByServerId.set(sid, arr);
  });

  const memberByServerId = new Map<string, any>();
  memberships.forEach((m: any) => memberByServerId.set(m.serverId.toString(), m));

  const allowedRooms = new Set<string>();
  allowedRooms.add(userId.toString());

  dmChannels.forEach((channel: any) => {
    allowedRooms.add(channel._id.toString());
  });

  for (const sid of serverIds) {
    allowedRooms.add(sid);

    const server = serverById.get(sid);
    const member = memberByServerId.get(sid);
    const serverRoles = rolesByServerId.get(sid) || [];
    const serverChannels = channelsByServerId.get(sid) || [];
    if (!server || !member || !server.everyoneRoleId) continue;

    const everyoneRole = serverRoles.find((r: any) => r._id?.toString?.() === server.everyoneRoleId.toString());
    if (!everyoneRole) continue;

    for (const channel of serverChannels) {
      const perms = calculateEffectivePermissions(member as any, serverRoles as any, everyoneRole as any, channel as any);
      if (perms.has('VIEW_CHANNEL')) {
        allowedRooms.add(channel._id.toString());
      }
    }
  }

  return allowedRooms;
};

const applyManagedRooms = async (socket: Socket, nextRooms: Set<string>) => {
  const data = socket.data as Record<string, any>;
  const prevRooms = new Set<string>(Array.isArray(data[MANAGED_ROOMS_KEY]) ? data[MANAGED_ROOMS_KEY] : []);

  for (const roomId of prevRooms) {
    if (!nextRooms.has(roomId)) {
      socket.leave(roomId);
    }
  }

  for (const roomId of nextRooms) {
    if (!prevRooms.has(roomId)) {
      socket.join(roomId);
    }
  }

  data[MANAGED_ROOMS_KEY] = Array.from(nextRooms);
};

export const joinUserRoomsForSocket = async (socket: Socket) => {
  if (!socket.user) return;
  try {
    const userId = socket.user.id;
    const allowedRooms = await collectAllowedRooms(userId);
    await applyManagedRooms(socket, allowedRooms);
    console.log(`User ${socket.user.username} synchronized rooms (${allowedRooms.size}).`);
  } catch (error) {
    console.error('Error synchronizing socket rooms:', error);
  }
};

export const refreshRoomsForUser = async (userId: string) => {
  let io: any = null;
  try {
    io = socketManager.getIO();
  } catch {
    return;
  }
  if (!io || typeof io.in !== 'function') return;

  try {
    const sockets = await io.in(userId).fetchSockets();
    if (!sockets.length) return;
    await Promise.all(sockets.map((socket: any) => joinUserRoomsForSocket(socket as unknown as Socket)));
  } catch (error) {
    if ((process.env.NODE_ENV || '').toLowerCase() !== 'test') {
      console.error(`Error refreshing rooms for user ${userId}:`, error);
    }
  }
};

export const refreshRoomsForServerMembers = async (serverId: string) => {
  try {
    const members = await ServerMember.find({ serverId: serverId as any }).select('userId').lean();
    const userIds = Array.from(new Set(members.map((m: any) => m.userId?.toString?.()).filter(Boolean)));
    await Promise.all(userIds.map((userId) => refreshRoomsForUser(userId)));
  } catch (error) {
    if ((process.env.NODE_ENV || '').toLowerCase() !== 'test') {
      console.error(`Error refreshing rooms for server ${serverId}:`, error);
    }
  }
};
