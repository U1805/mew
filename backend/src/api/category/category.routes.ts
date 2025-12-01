import { Router } from 'express';
import { protect } from '../../middleware/auth';
import validate from '../../middleware/validate';
import * as categoryController from './category.controller';
import { categoryIdParams, updateCategorySchema } from './category.validation';

const categoryRootRoutes = Router({ mergeParams: true });

// Routes for /api/servers/:serverId/categories
categoryRootRoutes.get('/', protect, categoryController.getCategoriesHandler);
categoryRootRoutes.post('/', protect, categoryController.createCategoryHandler);

const categoryDetailRoutes = Router({ mergeParams: true });

// Routes for /api/categories/:categoryId
categoryDetailRoutes.patch(
  '/:categoryId',
  protect,
  validate(updateCategorySchema),
  categoryController.updateCategoryHandler
);
categoryDetailRoutes.delete(
  '/:categoryId',
  protect,
  validate(categoryIdParams),
  categoryController.deleteCategoryHandler
);

export { categoryRootRoutes, categoryDetailRoutes };
