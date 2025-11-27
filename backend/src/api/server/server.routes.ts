import { Router } from 'express';
import { createServerHandler, getServerHandler } from './server.controller';
import channelRoutes from '../channel/channel.routes';
import { protect } from '../../middleware/auth';
import validate from '../../middleware/validate';
import { createServerSchema } from './server.validation';

const router = Router();

// All routes in this file are protected
router.use(protect);

router.post('/', validate(createServerSchema), createServerHandler);
router.get('/:serverId', getServerHandler);

// Mount channel routes
router.use('/:serverId/channels', channelRoutes);

export default router;
