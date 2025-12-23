import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import asyncHandler from '../../utils/asyncHandler';
import config from '../../config';
import { ForbiddenError } from '../../utils/errors';

export const loginHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { user, token } = await authService.login(req.body);
  res.status(200).json({ message: 'Login successful', user, token });
});

export const registerHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (!config.allowUserRegistration) {
    throw new ForbiddenError('User registration is disabled.');
  }
  const { user, token } = await authService.register(req.body);
  res.status(201).json({ message: 'User registered successfully', user, token });
});

export const getAuthConfigHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ allowUserRegistration: config.allowUserRegistration });
});
