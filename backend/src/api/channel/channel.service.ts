import mongoose from 'mongoose';
import Channel, { IChannel, IChannelUpdate } from './channel.model';
import Server from '../server/server.model';
import Category from '../category/category.model';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { socketManager } from '../../gateway/events';
import Message from '../message/message.model';


export const createChannel = async (
  channelData: Omit<IChannel, 'createdAt' | 'updatedAt'>
): Promise<IChannel> => {
  const newChannel = await Channel.create(channelData);
  return newChannel;
};

export const getChannelById = async (
  channelId: string
): Promise<IChannel | null> => {
  const channel = await Channel.findById(channelId);
  return channel;
};

export const updateChannel = async (
  channelId: string,
  channelData: IChannelUpdate
): Promise<IChannel | null> => {

  const channel = await Channel.findById(channelId);
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }

  // This operation is only applicable to server channels
  if (!channel.serverId) {
    throw new BadRequestError('This operation cannot be performed on DM channels.');
  }
  const serverId = channel.serverId; // Store serverId after check

  // Validate categoryId if it's being changed
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

  const updatedChannel = await channel.save();

  // The serverId is immutable in this function, so we can safely use the one we stored.
  socketManager.broadcast('CHANNEL_UPDATE', serverId.toString(), updatedChannel);

  return updatedChannel;
};


export const deleteChannel = async (
  channelId: string
): Promise<IChannel | null> => {
  const channel = await Channel.findById(channelId);
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }

  // First, delete all messages in the channel
  await Message.deleteMany({ channelId });

  // Then, delete the channel itself
  const deletedChannel = await Channel.findByIdAndDelete(channelId);

  if (deletedChannel && deletedChannel.serverId) {
    socketManager.broadcast('CHANNEL_DELETE', deletedChannel.serverId.toString(), {
      channelId: deletedChannel._id.toString(),
      serverId: deletedChannel.serverId.toString(),
    });
  }

  return deletedChannel;
};

import ServerMember from '../member/member.model';

// ... (other functions)

export const getChannelsByServer = async (serverId: string, userId: string): Promise<IChannel[]> => {
  const member = await ServerMember.findOne({ serverId, userId });
  if (!member) {
    throw new ForbiddenError('You are not a member of this server.');
  }

  const channels = await Channel.find({ serverId });
  return channels;
};


export const createDmChannel = async (userId: string, recipientId: string): Promise<IChannel> => {
  if (userId === recipientId) {
    throw new BadRequestError('You cannot create a DM with yourself');
  }
  // Check if a DM channel already exists between the two users
  let channel = await Channel.findOne({
    type: 'DM',
    recipients: { $all: [userId, recipientId], $size: 2 },
  });

  if (channel) {
    return channel;
  }

  // If not, create a new one.
  let newDmChannel = await Channel.create({
    type: 'DM',
    recipients: [
      new mongoose.Types.ObjectId(userId),
      new mongoose.Types.ObjectId(recipientId),
    ],
  });

  newDmChannel = await newDmChannel.populate('recipients', 'username avatarUrl');

  socketManager.broadcastToUser(recipientId, 'DM_CHANNEL_CREATE', newDmChannel);

  return newDmChannel;
};

export const getDmChannelsByUser = async (userId: string): Promise<IChannel[]> => {
  const channels = await Channel.find({
    type: 'DM',
    recipients: userId,
  }).populate('recipients', 'username avatar');

  return channels;
};
