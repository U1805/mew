import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import inviteService from './invite.service';

const inviteController = {
  createInvite: asyncHandler(async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const creatorId = req.user!.id; // Assuming user is available on req
    const { expiresAt, maxUses } = req.body;

    const invite = await inviteService.createInvite(serverId, creatorId, { expiresAt, maxUses });

    res.status(201).json(invite);
  }),

  getInviteDetails: asyncHandler(async (req: Request, res: Response) => {
    const { inviteCode } = req.params;
    const invite = await inviteService.getInviteDetails(inviteCode);
    res.status(200).json(invite);
  }),

  acceptInvite: asyncHandler(async (req: Request, res: Response) => {
    const { inviteCode } = req.params;
    const userId = req.user!.id;
    const invite = await inviteService.acceptInvite(inviteCode, userId);
    res.status(200).json({ serverId: invite.serverId });
  }),
};

export default inviteController;

