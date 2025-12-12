import { Request, Response, NextFunction } from 'express';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError, UnauthorizedError } from './errors';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof NotFoundError) {
    return res.status(404).json({ message: err.message });
  }
  if (err instanceof ForbiddenError) {
    return res.status(403).json({ message: err.message });
  }
  if (err instanceof BadRequestError) {
    return res.status(400).json({ message: err.message });
  }
  if (err instanceof ConflictError) {
    return res.status(409).json({ message: err.message });
  }
  if (err instanceof UnauthorizedError) {
    return res.status(401).json({ message: err.message });
  }

  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid data format provided.', error: err.message });
  }

  console.error(err);
  return res.status(500).json({ message: 'Internal Server Error' });
};
