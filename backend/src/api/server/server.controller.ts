import { Request, Response, NextFunction } from 'express';
import serverService from './server.service';
import asyncHandler from '../../utils/asyncHandler';
import { BadRequestError } from '../../utils/errors';

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
    req.body
  );
  res.status(200).json(server);
});

export const deleteServerHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const result = await serverService.deleteServer(
    req.params.serverId
  );
  res.status(200).json(result);
});

export const updateServerIconHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new BadRequestError('No file uploaded.');
  }

  const { serverId } = req.params;
  const uploaded: any = req.file as any;
  if (!uploaded.key) {
    const { uploadFile } = await import('../../utils/s3');
    Object.assign(uploaded, await uploadFile(req.file));
  }
  const server = await serverService.updateServerIcon(serverId, uploaded.key);

  res.status(200).json(server);
});
