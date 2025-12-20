import { Router } from 'express';
import inviteController from './invite.controller';
import validate from '../../middleware/validate';
import { createInviteSchema } from './invite.validation';

// This router is mounted with `mergeParams: true` to access :serverId
const router = Router({ mergeParams: true });

import { protect } from '../../middleware/auth';

import { authorizeServer } from '../../middleware/checkPermission';

router.post('/', protect, authorizeServer('CREATE_INVITE'), validate(createInviteSchema), inviteController.createInvite);

export default router;
