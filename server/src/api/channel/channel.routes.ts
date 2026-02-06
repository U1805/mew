import { Router } from 'express';
import {
  createChannelHandler,
  deleteChannelHandler,
  updateChannelHandler,
  getChannelsHandler,
  ackChannelHandler,
  getPermissionOverridesHandler,
  updatePermissionOverridesHandler
} from './channel.controller';
import messageRoutes from '../message/message.routes';
import webhookRoutes from '../webhook/webhook.routes';
import { authorizeChannel, authorizeServer } from '../../middleware/checkPermission';
import { protect } from '../../middleware/auth';
import { checkServerMembership } from '../../middleware/memberAuth';

import validate from '../../middleware/validate';
import { createChannelSchema, updateChannelSchema, ackChannelSchema, updatePermissionsSchema } from './channel.validation';

const router = Router({ mergeParams: true });

// All routes in this file are protected and require server membership
router.use(protect, checkServerMembership);

router.get('/', getChannelsHandler);
router.post('/', authorizeServer('MANAGE_CHANNEL'), validate(createChannelSchema), createChannelHandler);

// Mount message routes (must be able to view channel first)
router.use('/:channelId/messages', authorizeChannel('VIEW_CHANNEL'), messageRoutes);

// Mount webhook routes
router.use('/:channelId/webhooks', webhookRoutes);

router.patch(
  '/:channelId',
  authorizeChannel('MANAGE_CHANNEL'),
  validate(updateChannelSchema),
  updateChannelHandler
);

router.route('/:channelId/permissions')
  .get(authorizeChannel('MANAGE_CHANNEL'), getPermissionOverridesHandler)
  .put(authorizeChannel('MANAGE_CHANNEL'), validate(updatePermissionsSchema), updatePermissionOverridesHandler);

router.delete('/:channelId', authorizeChannel('MANAGE_CHANNEL'), deleteChannelHandler);

router.post('/:channelId/ack', validate(ackChannelSchema), ackChannelHandler);

export default router;
