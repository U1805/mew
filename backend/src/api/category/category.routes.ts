import { Router } from 'express';
import { protect } from '../../middleware/auth';
import * as categoryController from './category.controller';

const router = Router();

// These routes are nested under /api/servers/:serverId/categories
// But for simplicity in this file, we define specific parts.
// The serverId is handled in the main app router.

router.post('/', protect, categoryController.createCategoryHandler);

// These routes are for specific categories
const categoryRouter = Router({ mergeParams: true});

categoryRouter.patch('/:categoryId', protect, categoryController.updateCategoryHandler);
categoryRouter.delete('/:categoryId', protect, categoryController.deleteCategoryHandler);

export { router as categoryRootRoutes, categoryRouter as categoryDetailRoutes };
