import { Router } from 'express';
import { protect } from '../../middleware/auth';
import { checkServerMembership, authorizeRole } from '../../middleware/memberAuth';

import validate from '../../middleware/validate';
import * as categoryController from './category.controller';
import { categoryIdParams, updateCategorySchema } from './category.validation';

const categoryRootRoutes = Router({ mergeParams: true });

// Routes for /api/servers/:serverId/categories
categoryRootRoutes.use(protect, checkServerMembership);

categoryRootRoutes.get('/', categoryController.getCategoriesHandler);

categoryRootRoutes.post('/', authorizeRole(['OWNER']), categoryController.createCategoryHandler);


const categoryDetailRoutes = Router({ mergeParams: true });

// Routes for /api/categories/:categoryId
categoryDetailRoutes.patch(
  '/:categoryId',
  protect,
  // Note: For this route, we can't use checkServerMembership directly
  // as serverId is not in params. The check must be in the controller/service.
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
