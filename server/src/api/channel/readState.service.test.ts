import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import readStateService from './readState.service';
import Channel from './channel.model';
import Server from '../server/server.model';
import User from '../user/user.model';
import ServerMember from '../member/member.model';
import { ChannelReadState } from './readState.model';

describe('ReadState Service', () => {
  let testUser: any, testServer: any, testChannel: any, testDmChannel: any, testMessage: any;

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();

    testUser = await User.create({ username: 'testuser', email: 'test@test.com', password: 'password' });
    const otherUser = await User.create({ username: 'otheruser', email: 'other@test.com', password: 'password' });
    testServer = await Server.create({ name: 'Test Server', ownerId: testUser._id });
    await ServerMember.create({ serverId: testServer._id, userId: testUser._id, isOwner: true });
    testChannel = await Channel.create({ name: 'test-channel', serverId: testServer._id, type: 'GUILD_TEXT' });
    testDmChannel = await Channel.create({ type: 'DM', recipients: [testUser._id, otherUser._id] });
  });

  it('should create a read state for a channel', async () => {
    const messageId = new mongoose.Types.ObjectId().toHexString();
    await readStateService.ackChannel(testUser._id.toString(), testChannel._id.toString(), messageId);

    const readState = await ChannelReadState.findOne({ userId: testUser._id, channelId: testChannel._id });
    expect(readState).not.toBeNull();
    expect(readState?.lastReadMessageId.toString()).toBe(messageId);
  });

  it('should update an existing read state', async () => {
    const firstMessageId = new mongoose.Types.ObjectId().toHexString();
    const secondMessageId = new mongoose.Types.ObjectId().toHexString();
    await readStateService.ackChannel(testUser._id.toString(), testChannel._id.toString(), firstMessageId);
    await readStateService.ackChannel(testUser._id.toString(), testChannel._id.toString(), secondMessageId);

    const readState = await ChannelReadState.findOne({ userId: testUser._id, channelId: testChannel._id });
    expect(readState?.lastReadMessageId.toString()).toBe(secondMessageId);
    const count = await ChannelReadState.countDocuments({ userId: testUser._id, channelId: testChannel._id });
    expect(count).toBe(1);
  });

  it('should correctly ack a DM channel', async () => {
    const dmMessageId = new mongoose.Types.ObjectId().toHexString();
    await readStateService.ackChannel(testUser._id.toString(), testDmChannel._id.toString(), dmMessageId);

    const readState = await ChannelReadState.findOne({ userId: testUser._id, channelId: testDmChannel._id });
    expect(readState).not.toBeNull();
    expect(readState?.lastReadMessageId.toString()).toBe(dmMessageId);
  });

  it('should throw ForbiddenError if user is not a member of the server channel', async () => {
    const outsider = await User.create({ username: 'outsider', email: 'out@sider.com', password: 'password' });
    const messageId = new mongoose.Types.ObjectId().toHexString();
    await expect(readStateService.ackChannel(outsider._id.toString(), testChannel._id.toString(), messageId))
      .rejects.toThrow('You are not a member of this server.');
  });

  it('should throw ForbiddenError if user is not a recipient of the DM channel', async () => {
    const outsider = await User.create({ username: 'outsider', email: 'out@sider.com', password: 'password' });
    const messageId = new mongoose.Types.ObjectId().toHexString();
    await expect(readStateService.ackChannel(outsider._id.toString(), testDmChannel._id.toString(), messageId))
      .rejects.toThrow('You do not have access to this DM channel.');
  });
});