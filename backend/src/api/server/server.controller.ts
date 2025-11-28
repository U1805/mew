import { Request, Response, NextFunction } from 'express';
import * as serverService from './server.service';
import asyncHandler from '../../utils/asyncHandler';

export const createServerHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const data = {
    ...req.body,
    ownerId: req.user!.id,
  };
  const server = await serverService.createServer(data);
  res.status(201).json(server);
});

export const getServerHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const server = await serverService.getServerById(req.params.serverId);
  res.status(200).json(server);
});

export const getUserServersHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const servers = await serverService.getServersForUser(req.user!.id);
  res.status(200).json(servers);
});

export const updateServerHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const server = await serverService.updateServer(
    req.params.serverId,
    req.user!.id,
    req.body
  );
  res.status(200).json(server);
});

export const deleteServerHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const result = await serverService.deleteServer(
    req.params.serverId,
    req.user!.id
  );
  res.status(200).json(result);
});
