import { Router } from 'express';
import { getMeHandler } from './user.controller';
import { getUserServersHandler } from '../server/server.controller';
import { protect } from '../../middleware/auth';

const router = Router();

// All routes in this file are protected
router.use(protect);

router.get('/@me', getMeHandler);
router.get('/@me/servers', getUserServersHandler);

export default router;
