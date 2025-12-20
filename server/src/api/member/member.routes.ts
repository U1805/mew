import { Router } from 'express';
import memberController from './member.controller';
import { authorizeServer } from '../../middleware/checkPermission';
import { protect } from '../../middleware/auth';

const router = Router({ mergeParams: true });

router.use(protect);

router.get('/', memberController.getMembers);
router.delete('/@me', memberController.leaveServer);

router.delete('/:userId', authorizeServer('KICK_MEMBERS'), memberController.removeMember);
router.put('/:userId/roles', authorizeServer('MANAGE_ROLES'), memberController.updateMemberRoles);

export default router;