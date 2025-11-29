import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import { UnauthorizedError } from '../../utils/errors';
import * as categoryService from './category.service';

export const createCategoryHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedError('Not authenticated');
    }

    const { name } = req.body;
    const { serverId } = req.params;

    const newCategory = await categoryService.createCategory(
      name,
      serverId,
      req.user.id
    );

    res.status(201).json(newCategory);
  }
);

export const getCategoriesHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  const { serverId } = req.params;
  const categories = await categoryService.getCategoriesByServer(serverId, req.user.id);
  res.status(200).json(categories);
});