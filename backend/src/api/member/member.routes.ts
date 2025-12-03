import { Router } from 'express';
import memberController from './member.controller';

// This router is mounted with `mergeParams: true` to access :serverId
import { protect } from '../../middleware/auth';

const router = Router({ mergeParams: true });

// All member routes should be protected
router.use(protect);

router.get('/', memberController.getMembers);
router.delete('/@me', memberController.leaveServer);
router.delete('/:userId', memberController.removeMember);

export default router;
