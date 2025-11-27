import { Router } from 'express';
import { getMessagesHandler } from './message.controller';
import { protect } from '../../middleware/auth';

const router = Router({ mergeParams: true });

// All routes are protected
router.use(protect);

router.get('/', getMessagesHandler);

export default router;
