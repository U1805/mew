import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import botInviteService from './botInvite.service';

const botInviteController = {
  searchBots: asyncHandler(async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const q = (req.query.q as string) || '';
    const results = await botInviteService.searchServerBots(serverId, q);
    res.status(200).json(results);
  }),

  inviteBot: asyncHandler(async (req: Request, res: Response) => {
    const { serverId, botUserId } = req.params;
    await botInviteService.inviteBotToServer(serverId, botUserId);
    res.status(204).send();
  }),
};

export default botInviteController;

