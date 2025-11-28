import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import asyncHandler from '../../utils/asyncHandler';

export const loginHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { user, token } = await authService.login(req.body);
  res.status(200).json({ message: 'Login successful', user, token });
});

export const registerHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const user = await authService.register(req.body);
  res.status(201).json({ message: 'User registered successfully', user });
});