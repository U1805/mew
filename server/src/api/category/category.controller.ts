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
      serverId
    );

    res.status(201).json(newCategory);
  }
);

export const getCategoriesHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  const { serverId } = req.params;
  const categories = await categoryService.getCategoriesByServer(serverId);
  res.status(200).json(categories);
});

export const updateCategoryHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedError('Not authenticated');
    }
    const { categoryId } = req.params;
    const updatedCategory = await categoryService.updateCategoryById(
      categoryId,
      req.body,
      req.user.id
    );
    res.status(200).json(updatedCategory);
  }
);

export const deleteCategoryHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedError('Not authenticated');
    }
    const { categoryId } = req.params;
    await categoryService.deleteCategoryById(categoryId, req.user.id);
    res.status(204).send();
  }
);