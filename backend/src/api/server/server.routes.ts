import { Router } from 'express';
import {
  createServerHandler,
  deleteServerHandler,
  getServerHandler,
  updateServerHandler,
} from './server.controller.js';
import channelRoutes from '../channel/channel.routes.js';
import { protect } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import { createServerSchema, updateServerSchema } from './server.validation.js';

const router = Router();

// All routes in this file are protected
router.use(protect);

router.post('/', validate(createServerSchema), createServerHandler);
router.get('/:serverId', getServerHandler);
router.patch(
  '/:serverId',
  validate(updateServerSchema),
  updateServerHandler
);
router.delete('/:serverId', deleteServerHandler);

// Mount channel routes
router.use('/:serverId/channels', channelRoutes);

export default router;
