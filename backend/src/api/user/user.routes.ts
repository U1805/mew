import { Router } from 'express';
import { createDmChannelHandler, getMeHandler } from './user.controller.js';
import { getUserServersHandler } from '../server/server.controller.js';
import { protect } from '../../middleware/auth.js';

const router = Router();

// All routes in this file are protected
router.use(protect);

router.get('/@me', getMeHandler);
router.get('/@me/servers', getUserServersHandler);
router.post('/@me/channels', createDmChannelHandler);

export default router;
