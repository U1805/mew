import { Router } from 'express';
import roleController from './role.controller';
import { authorizeServer } from '../../middleware/checkPermission';
import { protect } from '../../middleware/auth';

const router = Router({ mergeParams: true });

router.use(protect);

router.route('/')
  .post(authorizeServer('MANAGE_ROLES'), roleController.createRole)
  .get(roleController.getRolesByServer);

router.patch('/positions', authorizeServer('MANAGE_ROLES'), roleController.updateRolePositions);

router.route('/:roleId')
  .patch(authorizeServer('MANAGE_ROLES'), roleController.updateRole)
  .delete(authorizeServer('MANAGE_ROLES'), roleController.deleteRole);

export default router;