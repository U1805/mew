import { Router } from 'express';
import {
  createChannelHandler,
  deleteChannelHandler,
  updateChannelHandler,
  getChannelsHandler, // 引入新的 handler
} from './channel.controller';
import messageRoutes from '../message/message.routes';
import { protect } from '../../middleware/auth';
import validate from '../../middleware/validate';
import { createChannelSchema, updateChannelSchema } from './channel.validation';

const router = Router({ mergeParams: true });

// All routes in this file are protected
router.use(protect);

// 添加 GET 路由
router.get('/', getChannelsHandler);
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