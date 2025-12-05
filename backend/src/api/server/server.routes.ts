import { Router } from 'express';
import {
  createServerHandler,
  deleteServerHandler,
  getServerHandler,
  updateServerHandler,
} from './server.controller';
import channelRoutes from '../channel/channel.routes';
import inviteRoutes from '../invite/invite.routes'; // Import invite routes
import memberRoutes from '../member/member.routes'; // Import member routes
import searchRoutes from '../search/search.routes'; // Import search routes


import { protect } from '../../middleware/auth';
import { checkServerMembership, authorizeRole } from '../../middleware/memberAuth';

import validate from '../../middleware/validate';
import { createServerSchema, updateServerSchema } from './server.validation';

const router = Router();

// All routes in this file are protected
router.use(protect);

router.post('/', validate(createServerSchema), createServerHandler);
router.get('/:serverId', checkServerMembership, getServerHandler);

router.patch(
  '/:serverId',
  checkServerMembership,
  authorizeRole(['OWNER']),
  validate(updateServerSchema),
  updateServerHandler
);

router.delete('/:serverId', checkServerMembership, authorizeRole(['OWNER']), deleteServerHandler);


// Mount channel routes
router.use('/:serverId/channels', channelRoutes);

// Mount invite routes
router.use('/:serverId/invites', inviteRoutes);

// Mount member routes
router.use('/:serverId/members', memberRoutes);

// Mount search routes
router.use('/:serverId/search', checkServerMembership, searchRoutes);



export default router;
