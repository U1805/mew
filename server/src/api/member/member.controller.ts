import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import memberService from './member.service';

const memberController = {
  getMembers: asyncHandler(async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const requesterId = req.user!.id;
    const members = await memberService.getMembersByServer(serverId, requesterId);
    res.status(200).json(members);
  }),

  removeMember: asyncHandler(async (req: Request, res: Response) => {
    const { serverId, userId } = req.params;
    const requesterId = req.user!.id;
    await memberService.removeMember(serverId, userId, requesterId);
    res.status(204).send();
  }),

  leaveServer: asyncHandler(async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const requesterId = req.user!.id;
    await memberService.leaveServer(serverId, requesterId);
    res.status(204).send();
  }),

  updateMemberRoles: asyncHandler(async (req: Request, res: Response) => {
    const { serverId, userId } = req.params;
    const requesterId = req.user!.id;
    const { roleIds } = req.body;
    const member = await memberService.updateMemberRoles(serverId, userId, requesterId, roleIds);
    res.status(200).json(member);
  }),

  getMyNotificationSettings: asyncHandler(async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const requesterId = req.user!.id;
    const settings = await memberService.getMyNotificationSettings(serverId, requesterId);
    res.status(200).json(settings);
  }),

  updateMyNotificationSettings: asyncHandler(async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const requesterId = req.user!.id;
    const settings = await memberService.updateMyNotificationSettings(serverId, requesterId, req.body);
    res.status(200).json(settings);
  }),
};

export default memberController;
