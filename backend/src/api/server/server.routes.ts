import { Router } from 'express';
import {
  createServerHandler,
  deleteServerHandler,
  getServerHandler,
  updateServerHandler,
} from './server.controller';
import channelRoutes from '../channel/channel.routes';
import inviteRoutes from '../invite/invite.routes';
import memberRoutes from '../member/member.routes';
import searchRoutes from '../search/search.routes';

import { protect } from '../../middleware/auth';
import { authorizeServer } from '../../middleware/checkPermission';
import { checkServerMembership } from '../../middleware/memberAuth';

import validate from '../../middleware/validate';
import { createServerSchema, updateServerSchema } from './server.validation';

const router = Router();

router.use(protect);

router.post('/', validate(createServerSchema), createServerHandler);
router.get('/:serverId', checkServerMembership, getServerHandler);

router.patch(
  '/:serverId',
  checkServerMembership,
  authorizeServer('MANAGE_SERVER'),
  validate(updateServerSchema),
  updateServerHandler
);

router.delete('/:serverId', checkServerMembership, authorizeServer('ADMINISTRATOR'), deleteServerHandler);

router.use('/:serverId/channels', channelRoutes);
router.use('/:serverId/invites', inviteRoutes);
router.use('/:serverId/members', memberRoutes);
router.use('/:serverId/search', checkServerMembership, searchRoutes);

export default router;
