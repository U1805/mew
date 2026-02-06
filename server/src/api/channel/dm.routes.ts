import { Router } from 'express';
import messageRoutes from '../message/message.routes';
import { protect } from '../../middleware/auth';
import { authorizeChannel } from '../../middleware/checkPermission';

const router = Router();

// Protect all DM channel routes
router.use(protect);

import { ackChannelHandler } from './channel.controller';
import { ackChannelSchema, updateMyChannelNotificationSettingsSchema } from './channel.validation';
import validate from '../../middleware/validate';
import { searchMessagesSchema } from '../search/search.validation';
import { searchChannelMessagesHandler } from './dm.search.controller';
import asyncHandler from '../../utils/asyncHandler';
import { UnauthorizedError } from '../../utils/errors';
import { UserChannelNotificationSetting } from './channelNotificationSetting.model';

// This will handle routes like /api/channels/:channelId/messages
//
// Note: despite the filename, this route is intentionally shared by both DM channels and server channels,
// so bots (and other clients) can use a single endpoint without needing serverId.
router.use('/:channelId', authorizeChannel('VIEW_CHANNEL'));
router.use('/:channelId/messages', messageRoutes);

router.get('/:channelId/search', validate(searchMessagesSchema), searchChannelMessagesHandler);
router.post('/:channelId/ack', validate(ackChannelSchema), ackChannelHandler);

router.get('/:channelId/notification-settings', asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const { channelId } = req.params as any;

  const existing = await UserChannelNotificationSetting.findOne({ userId: req.user.id, channelId }).select('level').lean();
  res.status(200).json({ level: existing?.level || 'DEFAULT' });
}));

router.put(
  '/:channelId/notification-settings',
  validate(updateMyChannelNotificationSettingsSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const { channelId } = req.params as any;
    const { level } = req.body as any;

    if (level === 'DEFAULT') {
      await UserChannelNotificationSetting.deleteOne({ userId: req.user.id, channelId });
      return res.status(200).json({ level: 'DEFAULT' });
    }

    const doc = await UserChannelNotificationSetting.findOneAndUpdate(
      { userId: req.user.id, channelId },
      { $set: { level } },
      { new: true, upsert: true, runValidators: true }
    ).select('level').lean();

    res.status(200).json({ level: doc?.level || level });
  })
);


export default router;
