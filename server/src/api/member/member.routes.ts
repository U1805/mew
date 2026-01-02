import { Router } from 'express';
import memberController from './member.controller';
import { authorizeServer } from '../../middleware/checkPermission';
import { protect } from '../../middleware/auth';
import validate from '../../middleware/validate';
import { updateMyServerNotificationSettingsSchema } from './member.validation';

const router = Router({ mergeParams: true });

router.use(protect);

router.get('/', memberController.getMembers);
router.delete('/@me', memberController.leaveServer);
router.get('/@me/notification-settings', memberController.getMyNotificationSettings);
router.put('/@me/notification-settings', validate(updateMyServerNotificationSettingsSchema), memberController.updateMyNotificationSettings);

router.delete('/:userId', authorizeServer('KICK_MEMBERS'), memberController.removeMember);
router.put('/:userId/roles', authorizeServer('MANAGE_ROLES'), memberController.updateMemberRoles);

export default router;
