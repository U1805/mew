import { Router } from 'express';
import {
  createChannelHandler,
  deleteChannelHandler,
  updateChannelHandler,
} from './channel.controller.js';
import messageRoutes from '../message/message.routes.js';
import { protect } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import { createChannelSchema, updateChannelSchema } from './channel.validation.js';

const router = Router({ mergeParams: true });

// All routes in this file are protected
router.use(protect);

router.post('/', validate(createChannelSchema), createChannelHandler);

router.patch(
  '/:channelId',
  validate(updateChannelSchema),
  updateChannelHandler
);
router.delete('/:channelId', deleteChannelHandler);

// Mount message routes
router.use('/:channelId/messages', messageRoutes);


export default router;
