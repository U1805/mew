import { Router } from 'express';
import { searchMessagesHandler } from './search.controller';
import validate from '../../middleware/validate';
import { protect } from '../../middleware/auth';
import { checkServerMembership } from '../../middleware/memberAuth';
import { searchMessagesSchema } from './search.validation';

const router = Router({ mergeParams: true });

/**
 * @route GET /api/servers/:serverId/search
 * @desc Search messages within a server
 * @access Private (Member)
 */
router.get('/', protect, checkServerMembership, validate(searchMessagesSchema), searchMessagesHandler);

export default router;
