import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcast: vi.fn(),
  },
}));

import { socketManager } from '../../gateway/events';
import botInviteService from './botInvite.service';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import Bot from '../bot/bot.model';
import Server from '../server/server.model';
import ServerMember from '../member/member.model';
import User from '../user/user.model';

describe('api/botInvite/botInvite.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchServerBots', () => {
    it('throws NotFoundError when server does not exist', async () => {
      await expect(botInviteService.searchServerBots(new Types.ObjectId().toString(), 'bot')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns empty array for empty/whitespace query', async () => {
      const server = await Server.create({ name: 's1', everyoneRoleId: new Types.ObjectId() });
      await expect(botInviteService.searchServerBots(server._id.toString(), '   ')).resolves.toEqual([]);
    });

    it('returns matching bots not already in server and backed by a BotModel', async () => {
      const server = await Server.create({ name: 's1', everyoneRoleId: new Types.ObjectId() });

      const owner = await User.create({ email: 'owner@test.com', username: 'owner', password: 'pw' });

      const validBotUser = await User.create({
        email: 'b1@test.com',
        username: 'bot(test)',
        password: 'pw',
        isBot: true,
        avatarUrl: 'avatar.png',
      });
      await Bot.create({
        ownerId: owner._id,
        botUserId: validBotUser._id,
        name: 'b1',
        accessToken: 'token-b1',
        serviceType: 'LOCAL',
      });

      const webhookBotUser = await User.create({
        email: 'b2@test.com',
        username: 'bot(test) webhook',
        password: 'pw',
        isBot: true,
      });

      const memberBotUser = await User.create({
        email: 'b3@test.com',
        username: 'bot(test) member',
        password: 'pw',
        isBot: true,
      });
      await Bot.create({
        ownerId: owner._id,
        botUserId: memberBotUser._id,
        name: 'b3',
        accessToken: 'token-b3',
        serviceType: 'LOCAL',
      });
      await ServerMember.create({
        serverId: server._id,
        userId: memberBotUser._id,
        roleIds: [server.everyoneRoleId],
      });

      const results = await botInviteService.searchServerBots(server._id.toString(), 'bot(');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(
        expect.objectContaining({
          _id: validBotUser._id,
          username: 'bot(test)',
          isBot: true,
        })
      );
      expect(results[0].avatarUrl).toMatch(/^http/);
      expect(results[0].avatarUrl).toMatch(/avatar\.png$/);

      expect(results.find((r: any) => r._id.toString() === webhookBotUser._id.toString())).toBeUndefined();
      expect(results.find((r: any) => r._id.toString() === memberBotUser._id.toString())).toBeUndefined();
    });
  });

  describe('inviteBotToServer', () => {
    it('throws NotFoundError when ids are invalid', async () => {
      await expect(botInviteService.inviteBotToServer('nope', 'also-nope')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError when server is missing', async () => {
      const botUser = await User.create({ email: 'b@test.com', username: 'bot', password: 'pw', isBot: true });
      await expect(botInviteService.inviteBotToServer(new Types.ObjectId().toString(), botUser._id.toString())).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ForbiddenError when target user is not a bot', async () => {
      const server = await Server.create({ name: 's1', everyoneRoleId: new Types.ObjectId() });
      const user = await User.create({ email: 'u@test.com', username: 'u1', password: 'pw', isBot: false });

      await expect(botInviteService.inviteBotToServer(server._id.toString(), user._id.toString())).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ForbiddenError when bot has no BotModel (webhook bot)', async () => {
      const server = await Server.create({ name: 's1', everyoneRoleId: new Types.ObjectId() });
      const botUser = await User.create({ email: 'b@test.com', username: 'b1', password: 'pw', isBot: true });

      await expect(botInviteService.inviteBotToServer(server._id.toString(), botUser._id.toString())).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('creates a membership and broadcasts MEMBER_JOIN', async () => {
      const server = await Server.create({ name: 's1', everyoneRoleId: new Types.ObjectId() });
      const owner = await User.create({ email: 'owner@test.com', username: 'owner', password: 'pw' });
      const botUser = await User.create({ email: 'b@test.com', username: 'b1', password: 'pw', isBot: true });
      await Bot.create({
        ownerId: owner._id,
        botUserId: botUser._id,
        name: 'b1',
        accessToken: 'token-b1',
        serviceType: 'LOCAL',
      });

      await botInviteService.inviteBotToServer(server._id.toString(), botUser._id.toString());

      const member = await ServerMember.findOne({ serverId: server._id, userId: botUser._id }).lean();
      expect(member).toBeTruthy();
      expect(member?.roleIds?.map(String)).toEqual([String(server.everyoneRoleId)]);

      expect(socketManager.broadcast).toHaveBeenCalledWith('MEMBER_JOIN', server._id.toString(), {
        serverId: server._id.toString(),
        userId: botUser._id.toString(),
      });

      vi.mocked(socketManager.broadcast).mockClear();
      await botInviteService.inviteBotToServer(server._id.toString(), botUser._id.toString());
      expect(socketManager.broadcast).not.toHaveBeenCalled();
    });
  });
});

