import mongoose from 'mongoose';
import Channel, { IChannel, IChannelUpdate } from './channel.model';
import Server from '../server/server.model';
import Category from '../category/category.model';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { socketManager } from '../../gateway/events';
import Message, { IMessage } from '../message/message.model';
import { ChannelReadState } from './readState.model';


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

export const getChannelsByServer = async (serverId: string, userId: string): Promise<any[]> => {
  const member = await ServerMember.findOne({ serverId, userId });
  if (!member) {
    throw new ForbiddenError('You are not a member of this server.');
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const serverObjectId = new mongoose.Types.ObjectId(serverId);

  const channels = await Channel.aggregate([
    {
      $match: {
        serverId: serverObjectId,
        type: 'GUILD_TEXT',
      },
    },
    {
      $lookup: {
        from: 'messages',
        localField: '_id',
        foreignField: 'channelId',
        as: 'lastMessageArr',
      },
    },
    {
      $lookup: {
        from: ChannelReadState.collection.name,
        let: { channelId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$channelId', '$$channelId'] },
                  { $eq: ['$userId', userObjectId] },
                ],
              },
            },
          },
          { $project: { lastReadMessageId: 1, _id: 0 } },
        ],
        as: 'readState',
      },
    },
    {
      $addFields: {
        lastReadMessageId: { $ifNull: [{ $first: '$readState.lastReadMessageId' }, null] },
      },
    },
    {
      $project: {
        readState: 0,
      },
    },
    {
      $sort: { position: 1 },
    }
  ]);

  // Manual sorting and message assignment at the application level
  channels.forEach(channel => {
    if (channel.lastMessageArr && channel.lastMessageArr.length > 0) {
      channel.lastMessageArr.sort((a: IMessage, b: IMessage) => b.createdAt.getTime() - a.createdAt.getTime());
      channel.lastMessage = channel.lastMessageArr[0];
    } else {
      channel.lastMessage = null;
    }
    delete channel.lastMessageArr; // Clean up the temporary array
  });

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

export const getDmChannelsByUser = async (userId: string): Promise<any[]> => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const channels = await Channel.aggregate([
    {
      $match: {
        type: 'DM',
        recipients: userObjectId,
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'recipients',
        foreignField: '_id',
        as: 'recipientsInfo',
      },
    },
    {
      $addFields: {
        recipients: '$recipientsInfo',
      },
    },
    {
      $lookup: {
        from: 'messages',
        localField: '_id',
        foreignField: 'channelId',
        as: 'lastMessageArr',
      },
    },
    {
      $lookup: {
        from: ChannelReadState.collection.name,
        let: { channelId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$channelId', '$$channelId'] },
                  { $eq: ['$userId', userObjectId] },
                ],
              },
            },
          },
          { $project: { lastReadMessageId: 1, _id: 0 } },
        ],
        as: 'readState',
      },
    },
    {
      $addFields: {
        lastReadMessageId: { $ifNull: [{ $first: '$readState.lastReadMessageId' }, null] },
      },
    },
    {
      $project: {
        recipientsInfo: 0,
        readState: 0,
      },
    },
  ]);

  // Manual sorting and message assignment at the application level
  channels.forEach(channel => {
    if (channel.lastMessageArr && channel.lastMessageArr.length > 0) {
      channel.lastMessageArr.sort((a: IMessage, b: IMessage) => b.createdAt.getTime() - a.createdAt.getTime());
      channel.lastMessage = channel.lastMessageArr[0];
    } else {
      channel.lastMessage = null;
    }
    delete channel.lastMessageArr; // Clean up the temporary array
  });

  return channels;
};


export const ackChannel = async (userId: string, channelId: string, lastMessageId: string): Promise<void> => {
  const channel = await Channel.findById(channelId);
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }

  // Check if user has access to this channel
  if (channel.type === 'DM') {
    if (!channel.recipients || !channel.recipients.map(id => id.toString()).includes(userId)) {
      throw new ForbiddenError('You do not have access to this DM channel.');
    }
  } else if (channel.type === 'GUILD_TEXT') {
    const member = await ServerMember.findOne({ serverId: channel.serverId, userId });
    if (!member) {
      throw new ForbiddenError('You are not a member of this server.');
    }
  }

  await ChannelReadState.updateOne(
    { userId, channelId },
    { $set: { lastReadMessageId: lastMessageId } },
    { upsert: true }
  );
};
