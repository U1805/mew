import { Router } from 'express';
import {
  createChannelHandler,
  deleteChannelHandler,
  updateChannelHandler,
  getChannelsHandler,
} from './channel.controller';
import messageRoutes from '../message/message.routes';
import webhookRoutes from '../webhook/webhook.routes';
import { protect } from '../../middleware/auth';
import { checkServerMembership, authorizeRole } from '../../middleware/memberAuth';

import validate from '../../middleware/validate';
import { createChannelSchema, updateChannelSchema } from './channel.validation';

const router = Router({ mergeParams: true });

// All routes in this file are protected and require server membership
router.use(protect, checkServerMembership);


router.get('/', getChannelsHandler);
router.post('/', authorizeRole(['OWNER']), validate(createChannelSchema), createChannelHandler);


// Mount message routes
router.use('/:channelId/messages', messageRoutes);

// Mount webhook routes
router.use('/:channelId/webhooks', webhookRoutes);

router.patch(
  '/:channelId',
  authorizeRole(['OWNER']),
  validate(updateChannelSchema),
  updateChannelHandler
);

router.delete('/:channelId', authorizeRole(['OWNER']), deleteChannelHandler);


export default router;
