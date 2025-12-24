import { Router } from 'express';
import botInviteController from './botInvite.controller';
import { checkServerMembership } from '../../middleware/memberAuth';
import { requireServerOwner } from '../../middleware/requireServerOwner';

const router = Router({ mergeParams: true });

router.use(checkServerMembership, requireServerOwner);

router.get('/search', botInviteController.searchBots);
router.post('/:botUserId', botInviteController.inviteBot);

export default router;

