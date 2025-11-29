import { Router } from 'express';
import { protect } from '../../middleware/auth';
import * as categoryController from './category.controller';

const categoryRootRoutes = Router({ mergeParams: true });

// Routes for /api/servers/:serverId/categories
categoryRootRoutes.get('/', protect, categoryController.getCategoriesHandler);
categoryRootRoutes.post('/', protect, categoryController.createCategoryHandler);

const categoryDetailRoutes = Router({ mergeParams: true });

// Placeholder for routes like /api/categories/:categoryId
// e.g., categoryDetailRoutes.patch('/:categoryId', protect, ...);

export { categoryRootRoutes, categoryDetailRoutes };
