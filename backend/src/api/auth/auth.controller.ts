import { Request, Response } from 'express';
import * as authService from './auth.service';

export const loginHandler = async (req: Request, res: Response) => {
  try {
    const { user, token } = await authService.login(req.body);
    res.status(200).json({ message: 'Login successful', user, token });
  } catch (error) {
    if (error instanceof Error) {
        return res.status(401).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};

export const registerHandler = async (req: Request, res: Response) => {
  try {
    const user = await authService.register(req.body);
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (error) {
    if (error instanceof Error) {
        // A simple check for duplicate key error from MongoDB
        if ('code' in error && error.code === 11000) {
            return res.status(409).json({ message: 'Email or username already exists' });
        }
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'An unknown error occurred' });
  }
};