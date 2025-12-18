import mongoose from 'mongoose';
import { IChannel, IChannelUpdate } from './channel.model';
import Server, { IServer } from '../server/server.model';
import Role, { IRole } from '../role/role.model';
import { calculateEffectivePermissions, syncUserChannelPermissions } from '../../utils/permission.service';
import Category from '../category/category.model';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { socketManager } from '../../gateway/events';
import { channelRepository } from './channel.repository';
import Message, { IMessage } from '../message/message.model';
import { ChannelReadState } from './readState.model';
import ServerMember from '../member/member.model';
import { DM_PERMISSIONS } from '../../constants/permissions';
import { Webhook } from '../webhook/webhook.model';
import { getS3PublicUrl } from '../../utils/s3';

function hydrateUserAvatarUrl<T extends { avatarUrl?: string }>(user: T): T {
  if (user.avatarUrl) {
    user.avatarUrl = getS3PublicUrl(user.avatarUrl);
  }
  return user;
}

const channelService = {
  async createChannel(channelData: Omit<IChannel, 'createdAt' | 'updatedAt'>): Promise<IChannel> {
    const newChannel = await channelRepository.create(channelData);
    return newChannel;
  },

  async getChannelById(channelId: string): Promise<IChannel | null> {
    const channel = await channelRepository.findById(channelId);
    return channel;
  },

  async updateChannel(channelId: string, channelData: IChannelUpdate): Promise<IChannel | null> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    if (!channel.serverId) {
      throw new BadRequestError('This operation cannot be performed on DM channels.');
    }
    const serverId = channel.serverId;

    if (channelData.categoryId !== undefined) {
      if (channelData.categoryId !== null) {
        const category = await Category.findById(channelData.categoryId);
        if (!category) {
          throw new BadRequestError('Category not found');
        }
        if (category.serverId.toString() !== serverId.toString()) {
          throw new BadRequestError('Category does not belong to this server');
        }
      }
      channel.categoryId = channelData.categoryId;
    }

    if (channelData.name) {
      channel.name = channelData.name;
    }

    // Check for topic separately to allow setting an empty topic
    if (channelData.topic !== undefined) {
        channel.topic = channelData.topic;
    }

    const updatedChannel = await channelRepository.save(channel);
    socketManager.broadcast('CHANNEL_UPDATE', serverId.toString(), updatedChannel);
    return updatedChannel;
  },

  async deleteChannel(channelId: string): Promise<IChannel | null> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    await Message.deleteMany({ channelId });
    await Webhook.deleteMany({ channelId });
    const deletedChannel = await channelRepository.deleteById(channelId);

    if (deletedChannel && deletedChannel.serverId) {
      socketManager.broadcast('CHANNEL_DELETE', deletedChannel.serverId.toString(), {
        channelId: deletedChannel._id.toString(),
        serverId: deletedChannel.serverId.toString(),
      });
    }

    return deletedChannel;
  },

  async getChannelsByServer(serverId: string, userId: string): Promise<any[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const serverObjectId = new mongoose.Types.ObjectId(serverId);

    const [member, server, roles, baseChannels] = await Promise.all([
      ServerMember.findOne({ serverId: serverObjectId, userId: userObjectId }).lean(),
      Server.findById(serverObjectId).lean(),
      Role.find({ serverId: serverObjectId } as any).lean(),
      channelRepository.findVisibleChannelsForUser(serverId, userId),
    ]);

    if (!member) {
      throw new ForbiddenError('You are not a member of this server.');
    }
    if (!server) {
      throw new NotFoundError('Server not found');
    }

    const everyoneRole = roles.find(r => r._id.equals(server.everyoneRoleId));
    if (!everyoneRole) {
      throw new NotFoundError('Default role not found for this server');
    }


    const processedChannels = baseChannels.map(channel => {
      const permissions = calculateEffectivePermissions(member, roles, everyoneRole, channel);
      return { ...channel, permissions: Array.from(permissions) };
    });

    return processedChannels;
  },

  async createDmChannel(userId: string, recipientId: string): Promise<IChannel> {
    if (userId === recipientId) {
      throw new BadRequestError('You cannot create a DM with yourself');
    }
    let channel = await channelRepository.findOne({ type: 'DM', recipients: { $all: [userId, recipientId], $size: 2 } });

    if (channel) {
      return channel;
    }

    let newDmChannel = await channelRepository.createDmChannel(userId, recipientId);
    newDmChannel = await newDmChannel.populate('recipients', 'username avatarUrl');

    if (Array.isArray((newDmChannel as any).recipients)) {
      (newDmChannel as any).recipients = (newDmChannel as any).recipients.map(hydrateUserAvatarUrl);
    }

    socketManager.broadcastToUser(recipientId, 'DM_CHANNEL_CREATE', newDmChannel);
    return newDmChannel;
  },

  async getDmChannelsByUser(userId: string): Promise<any[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const channels = await channelRepository.findDmChannelsByUser(userId);

    channels.forEach((channel) => {
      if (Array.isArray(channel.recipients)) {
        channel.recipients = channel.recipients.map(hydrateUserAvatarUrl);
      }
    });

    return channels;
  },


  async getPermissionOverrides(channelId: string) {
    const channel = await channelRepository.findByIdWithOverrides(channelId);
    if (!channel) {
      throw new NotFoundError('Channel not found');
    }
    return channel.permissionOverrides;
  },

  async updatePermissionOverrides(channelId: string, overrides: any[], userId: string) {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    if (!channel.serverId) {
      throw new BadRequestError('Permission overrides are not applicable to DM channels.');
    }

    const serverId = channel.serverId;

    // --- Self-Lockout Prevention ---
    const [member, server, roles] = await Promise.all([
      ServerMember.findOne({ serverId, userId }),
      Server.findById(serverId),
      Role.find({ serverId: serverId as any }),
    ]);

    if (!member) {
      throw new ForbiddenError('You are not a member of this server.');
    }
    if (!server) {
      throw new NotFoundError('Server not found.');
    }

    const isExempt = () => {
      if (member.isOwner) return true;
      const memberRoles = roles.filter(r => member.roleIds.some(mR => mR.equals(r._id)));
      for (const role of memberRoles) {
        if (role.permissions.includes('ADMINISTRATOR')) {
          return true;
        }
      }
      return false;
    };

    if (!isExempt()) {
      const everyoneRole = roles.find(r => r._id.equals(server.everyoneRoleId!));
      if (!everyoneRole) {
          throw new NotFoundError('@everyone role not found for this server.');
      }

      // Pre-calculate permissions with the new overrides.
      // We use a temporary object to avoid mutating the actual channel document before validation.
      const simulatedChannel = { ...channel.toObject(), permissionOverrides: overrides } as unknown as IChannel;
      const simulatedPermissions = calculateEffectivePermissions(member, roles, everyoneRole, simulatedChannel);

      if (!simulatedPermissions.has('MANAGE_CHANNEL')) {
        throw new ForbiddenError('You cannot submit changes that would remove your own MANAGE_CHANNEL permission.');
      }
    }
    // --- End Self-Lockout Prevention ---

    channel.permissionOverrides = overrides;
    await channelRepository.save(channel);

    if (channel.serverId) {
        const serverIdStr = channel.serverId.toString();
        socketManager.broadcast('PERMISSIONS_UPDATE', serverIdStr, { serverId: serverIdStr, channelId });

        // Asynchronously re-evaluate permissions for all server members for this specific channel.
        (async () => {
            try {
                const members = await ServerMember.find({ serverId: serverIdStr });
                for (const member of members) {
                    await syncUserChannelPermissions(member.userId.toString(), channelId);
                }
            } catch (error) {
                console.error('Error during background permission sync after override update:', error);
            }
        })();
    }

    return channel.permissionOverrides;
  },
};

export default channelService;
