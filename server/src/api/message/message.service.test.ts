import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { createMessage, updateMessage } from './message.service';
import mentionService from './mention.service';
import Channel from '../channel/channel.model';
import User from '../user/user.model';
import Server from '../server/server.model';
import Message from './message.model';

// Mock the mention service
vi.mock('./mention.service', () => ({
  default: {
    processMentions: vi.fn(),
  },
}));

// Mock socket manager
vi.mock('../../gateway/events', () => ({
    socketManager: {
      broadcast: vi.fn(),
    },
  }));


describe('Message Service', () => {
  let testUser: any, testChannel: any, testServer: any;

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    vi.clearAllMocks();

    testUser = await User.create({ username: 'testuser', email: 'test@test.com', password: 'password' });
    testServer = await Server.create({ name: 'Test Server', ownerId: testUser._id });
    testChannel = await Channel.create({ name: 'test-channel', serverId: testServer._id, type: 'GUILD_TEXT' });
  });

  describe('createMessage', () => {
    it('should call mentionService.processMentions with the correct arguments', async () => {
        const content = 'Hello there!';
        const mentionedUserIds = [new mongoose.Types.ObjectId()];
        (mentionService.processMentions as ReturnType<typeof vi.fn>).mockResolvedValue(mentionedUserIds);

        await createMessage(
          { content, channelId: testChannel._id.toString(), authorId: testUser._id.toString() },
          { bypassPermissions: true }
        );

        expect(mentionService.processMentions).toHaveBeenCalledOnce();
        expect(mentionService.processMentions).toHaveBeenCalledWith(content, testChannel._id.toString(), testUser._id.toString());
    });

    it('should save the message with the mentions returned by mentionService', async () => {
        const content = 'Check this out';
        const mentionedUserIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
        (mentionService.processMentions as ReturnType<typeof vi.fn>).mockResolvedValue(mentionedUserIds);

        const message = await createMessage(
          { content, channelId: testChannel._id.toString(), authorId: testUser._id.toString() },
          { bypassPermissions: true }
        );

        const dbMessage = await Message.findById(message._id);
        expect(dbMessage.mentions.map(String)).toEqual(mentionedUserIds.map(String));
    });
  });

  describe('updateMessage', () => {
    let message: any;

    beforeEach(async () => {
        message = await Message.create({ content: 'Original', channelId: testChannel._id, authorId: testUser._id });
    });

    it('should call mentionService.processMentions on update', async () => {
        const updatedContent = 'Updated content';
        (mentionService.processMentions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        await updateMessage(message._id.toString(), testUser._id.toString(), updatedContent);

        expect(mentionService.processMentions).toHaveBeenCalledOnce();
        expect(mentionService.processMentions).toHaveBeenCalledWith(updatedContent, testChannel._id.toString(), testUser._id.toString());
    });

    it('should update message mentions with the result from mentionService', async () => {
        const updatedContent = 'New mentions here';
        const newMentionIds = [new mongoose.Types.ObjectId()];
        (mentionService.processMentions as ReturnType<typeof vi.fn>).mockResolvedValue(newMentionIds);

        await updateMessage(message._id.toString(), testUser._id.toString(), updatedContent);

        const dbMessage = await Message.findById(message._id);
        expect(dbMessage.mentions.map(String)).toEqual(newMentionIds.map(String));
    });
  });

});
