import { Router } from 'express';
import { protect } from '../../middleware/auth';
import inviteController from './invite.controller';

const router = Router();

router.use(protect);

router.get('/:inviteCode', inviteController.getInviteDetails);
router.post('/:inviteCode', inviteController.acceptInvite);

export default router;
