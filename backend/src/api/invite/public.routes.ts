import { Router } from 'express';
import { protect } from '../../middleware/auth';

const router = Router();

// All routes in this file are protected
router.use(protect);

import inviteController from './invite.controller';

router.get('/:inviteCode', inviteController.getInviteDetails);
router.post('/:inviteCode', inviteController.acceptInvite);


export default router;
