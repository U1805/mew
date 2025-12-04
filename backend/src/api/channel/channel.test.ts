import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as channelService from './channel.service';
import { socketManager } from '../../gateway/events';
import Channel from './channel.model';
import User from '../user/user.model';

// Mock the socketManager
vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcastToUser: vi.fn(),
  },
}));

describe('Channel Service', () => {
  afterEach(async () => {
    await Channel.deleteMany({});
    await User.deleteMany({});
    vi.clearAllMocks();
  });

  describe('createDmChannel', () => {
    it('should broadcast DM_CHANNEL_CREATE event to the recipient when a new DM channel is created', async () => {
      const user1 = await User.create({ email: 'user1@test.com', username: 'user1', password: 'password' });
      const user2 = await User.create({ email: 'user2@test.com', username: 'user2', password: 'password' });

      const newChannel = await channelService.createDmChannel(user1._id.toString(), user2._id.toString());

      expect(socketManager.broadcastToUser).toHaveBeenCalledOnce();
      expect(socketManager.broadcastToUser).toHaveBeenCalledWith(
        user2._id.toString(),
        'DM_CHANNEL_CREATE',
        expect.objectContaining({
          _id: newChannel._id,
          type: 'DM',
          recipients: expect.arrayContaining([
            expect.objectContaining({ username: 'user1' }),
            expect.objectContaining({ username: 'user2' }),
          ]),
        })
      );
    });

    it('should not broadcast an event if the DM channel already exists', async () => {
        const user1 = await User.create({ email: 'user1@test.com', username: 'user1', password: 'password' });
        const user2 = await User.create({ email: 'user2@test.com', username: 'user2', password: 'password' });

        // Create channel for the first time
        await channelService.createDmChannel(user1._id.toString(), user2._id.toString());
        // Reset mock after first call
        vi.clearAllMocks();

        // Call it again
        await channelService.createDmChannel(user1._id.toString(), user2._id.toString());

        expect(socketManager.broadcastToUser).not.toHaveBeenCalled();
    });
  });
});
