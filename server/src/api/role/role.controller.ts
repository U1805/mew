import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import roleService from './role.service';

const roleController = {
  createRole: asyncHandler(async (req: Request, res: Response) => {
    const role = await roleService.createRole(req.params.serverId, req.user!.id, req.body);
    res.status(201).json(role);
  }),

  getRolesByServer: asyncHandler(async (req: Request, res: Response) => {
    const roles = await roleService.getRolesByServer(req.params.serverId);
    res.status(200).json(roles);
  }),

  updateRole: asyncHandler(async (req: Request, res: Response) => {
    const role = await roleService.updateRole(req.params.roleId, req.params.serverId, req.user!.id, req.body);
    res.status(200).json(role);
  }),

  updateRolePositions: asyncHandler(async (req: Request, res: Response) => {
    const roles = await roleService.updateRolePositions(req.params.serverId, req.user!.id, req.body);
    res.status(200).json(roles);
  }),

  deleteRole: asyncHandler(async (req: Request, res: Response) => {
    const result = await roleService.deleteRole(req.params.roleId, req.params.serverId, req.user!.id);
    res.status(200).json(result);
  }),
};

export default roleController;
