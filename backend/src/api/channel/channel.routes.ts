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
import validate from '../../middleware/validate';
import { createChannelSchema, updateChannelSchema } from './channel.validation';

const router = Router({ mergeParams: true });

// All routes in this file are protected
router.use(protect);

router.get('/', getChannelsHandler);
router.post('/', validate(createChannelSchema), createChannelHandler);

// Mount message routes
router.use('/:channelId/messages', messageRoutes);

// Mount webhook routes
router.use('/:channelId/webhooks', webhookRoutes);

router.patch(
  '/:channelId',
  validate(updateChannelSchema),
  updateChannelHandler
);
router.delete('/:channelId', deleteChannelHandler);

export default router;
