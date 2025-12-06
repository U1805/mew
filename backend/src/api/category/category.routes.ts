import { Router } from 'express';
import { protect } from '../../middleware/auth';
import { checkServerMembership, setServerIdFromCategory } from '../../middleware/memberAuth';

import validate from '../../middleware/validate';
import * as categoryController from './category.controller';
import { categoryIdParams, updateCategorySchema } from './category.validation';

const categoryRootRoutes = Router({ mergeParams: true });

// Routes for /api/servers/:serverId/categories
categoryRootRoutes.use(protect, checkServerMembership);

categoryRootRoutes.get('/', categoryController.getCategoriesHandler);

import { authorizeServer } from '../../middleware/checkPermission';

categoryRootRoutes.post('/', authorizeServer('MANAGE_CHANNEL'), categoryController.createCategoryHandler);


const categoryDetailRoutes = Router({ mergeParams: true });

// Routes for /api/categories/:categoryId
categoryDetailRoutes.patch(
  '/:categoryId',
  protect,
  setServerIdFromCategory,
  checkServerMembership,
  authorizeServer('MANAGE_CHANNEL'),
  validate(updateCategorySchema),
  categoryController.updateCategoryHandler
);

categoryDetailRoutes.delete(
  '/:categoryId',
  protect,
  setServerIdFromCategory,
  checkServerMembership,
  authorizeServer('MANAGE_CHANNEL'),
  validate(categoryIdParams),
  categoryController.deleteCategoryHandler
);


export { categoryRootRoutes, categoryDetailRoutes };
