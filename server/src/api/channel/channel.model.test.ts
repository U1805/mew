import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Channel, { ChannelType } from './channel.model';
import '../../test/setup';

describe('Channel Model', () => {
  it('should create and save a channel with permission overrides', async () => {
    const roleId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();

    const channelData = {
      name: 'test-channel',
      type: ChannelType.GUILD_TEXT,
      serverId: new mongoose.Types.ObjectId(),
      permissionOverrides: [
        {
          targetType: 'role',
          targetId: roleId,
          allow: ['SEND_MESSAGES'],
          deny: ['ATTACH_FILES'],
        },
        {
          targetType: 'member',
          targetId: memberId,
          allow: ['ADD_REACTIONS'],
          deny: [],
        },
      ],
    };

    const channel = new Channel(channelData);
    const savedChannel = await channel.save();

    expect(savedChannel._id).toBeDefined();
    expect(savedChannel.name).toBe(channelData.name);
    expect(savedChannel.permissionOverrides).toBeDefined();
    expect(savedChannel.permissionOverrides?.length).toBe(2);

    const roleOverride = savedChannel.permissionOverrides?.find(
      (o) => o.targetType === 'role'
    );
    expect(roleOverride?.targetId).toEqual(roleId);
    expect(roleOverride?.allow).toEqual(['SEND_MESSAGES']);
    expect(roleOverride?.deny).toEqual(['ATTACH_FILES']);

     const memberOverride = savedChannel.permissionOverrides?.find(
      (o) => o.targetType === 'member'
    );
    expect(memberOverride?.targetId).toEqual(memberId);
  });

  it('should create a channel with default empty permissionOverrides', async () => {
    const channelData = {
      name: 'default-channel',
      type: ChannelType.GUILD_TEXT,
      serverId: new mongoose.Types.ObjectId(),
    };

    const channel = new Channel(channelData);
    const savedChannel = await channel.save();

    expect(savedChannel.permissionOverrides).toEqual([]);
  });
});
