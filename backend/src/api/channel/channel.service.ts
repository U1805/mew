import Channel, { IChannel } from '../../models/Channel';
import Server from '../../models/Server';
import Message from '../../models/Message';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { broadcastEvent } from '../../gateway/events';

export const createChannel = async (data: Partial<IChannel>, userId: string) => {
  const { serverId } = data;
  if (!serverId) {
    throw new Error('Server ID is required to create a channel');
  }

  const server = await Server.findById(serverId);
  if (!server) {
    throw new NotFoundError('Server not found');
  }

  if (server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You do not have permission to create a channel in this server');
  }

  const channel = new Channel(data);
  await channel.save();
  return channel;
};

export const getChannelById = async (channelId: string) => {
  const channel = await Channel.findById(channelId);
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }
  return channel;
};

interface UpdateChannelData {
  name?: string;
  categoryId?: string;
}

export const updateChannel = async (
  channelId: string,
  userId: string,
  data: UpdateChannelData
) => {
  const channel = await getChannelById(channelId);
  const server = await Server.findById(channel.serverId);

  if (!server || server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You do not have permission to edit this channel');
  }

  Object.assign(channel, data);
  await channel.save();

  broadcastEvent(channel.serverId.toString(), 'CHANNEL_UPDATE', channel);

  return channel;
};

export const deleteChannel = async (channelId: string, userId: string) => {
  const channel = await getChannelById(channelId);
  const server = await Server.findById(channel.serverId);

  if (!server || server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You do not have permission to delete this channel');
  }

  // Cascade delete messages in the channel
  await Message.deleteMany({ channelId });
  await channel.deleteOne();

  broadcastEvent(channel.serverId.toString(), 'CHANNEL_DELETE', { channelId });

  return { message: 'Channel deleted successfully' };
};

export const createDmChannel = async (userId: string, recipientId: string) => {
  if (userId === recipientId) {
    throw new Error('You cannot create a DM with yourself');
  }

  // Check if a DM channel already exists between the two users
  let channel = await Channel.findOne({
    type: 'DM',
    recipients: { $all: [userId, recipientId], $size: 2 },
  });

  if (channel) {
    return channel;
  }

  channel = new Channel({
    type: 'DM',
    recipients: [userId, recipientId],
  });

  await channel.save();

  // Join both users to the new channel room
  // This part requires access to the socket instances, so we'll handle it via events or another mechanism

  return channel;
};
