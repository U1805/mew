import { Request, Response } from 'express';
import * as categoryService from './category.service';
import { createCategorySchema, updateCategorySchema, categoryIdParams } from './category.validation';
import { UnauthorizedError } from '../../utils/errors';
import asyncHandler from '../../utils/asyncHandler';

export const createCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  const { serverId } = createCategorySchema.parse(req).params;
  const { name } = createCategorySchema.parse(req).body;

  const category = await categoryService.createCategory({ name, serverId }, req.user.id);
  res.status(201).json(category);
});

export const updateCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  const { categoryId } = updateCategorySchema.parse(req).params;
  const data = updateCategorySchema.parse(req).body;

  const category = await categoryService.updateCategory(categoryId, req.user.id, data);
  res.status(200).json(category);
});

export const deleteCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  const { categoryId } = categoryIdParams.parse(req).params;

  const result = await categoryService.deleteCategory(categoryId, req.user.id);
  res.status(200).json(result);
});
