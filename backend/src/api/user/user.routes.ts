import { Router } from 'express';
import { createDmChannelHandler, getDmChannelsHandler, getMeHandler, searchUsersHandler, getUserByIdHandler } from './user.controller';
import { getUserServersHandler } from '../server/server.controller';
import { protect } from '../../middleware/auth';

const router = Router();

// All routes in this file are protected
router.use(protect);

router.get('/@me', getMeHandler);
router.get('/@me/servers', getUserServersHandler);
router.get('/@me/channels', getDmChannelsHandler);
router.post('/@me/channels', createDmChannelHandler);
router.get('/search', searchUsersHandler);
router.get('/:userId', getUserByIdHandler);

export default router;
