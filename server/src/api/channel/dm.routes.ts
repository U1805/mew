import { Router } from 'express';
import messageRoutes from '../message/message.routes';
import { protect } from '../../middleware/auth';
// You might want to add a middleware to check if the user is a recipient of the DM channel
// For now, we'll just protect it.

const router = Router();

// Protect all DM channel routes
router.use(protect);

// Mount message routes for DMs
import { ackChannelHandler } from './channel.controller';
import { ackChannelSchema, updateMyChannelNotificationSettingsSchema } from './channel.validation';
import validate from '../../middleware/validate';
import { searchMessagesSchema } from '../search/search.validation';
import { searchChannelMessagesHandler } from './dm.search.controller';
import Channel from './channel.model';
import ServerMember from '../member/member.model';
import asyncHandler from '../../utils/asyncHandler';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import { UserChannelNotificationSetting } from './channelNotificationSetting.model';

// This will handle routes like /api/channels/:channelId/messages
//
// Note: despite the filename, this route is intentionally shared by both DM channels and server channels,
// so bots (and other clients) can use a single endpoint without needing serverId.
const authorizeChannelRead = asyncHandler(async (req, _res, next) => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const { channelId } = req.params as any;
  if (!channelId) throw new BadRequestError('Channel ID is required.');

  const channel = await Channel.findById(channelId).select('type recipients serverId').lean();
  if (!channel) throw new NotFoundError('Channel not found.');

  if (channel.type === 'DM') {
    const isRecipient = Array.isArray(channel.recipients) && channel.recipients.some((id: any) => id.equals(req.user!.id));
    if (!isRecipient) throw new ForbiddenError('You are not a recipient of this DM channel.');
    return next();
  }

  if (!channel.serverId) throw new BadRequestError('Invalid channel: serverId is missing.');
  const member = await ServerMember.findOne({ serverId: channel.serverId.toString(), userId: req.user.id });
  if (!member) throw new ForbiddenError('You are not a member of this server.');
  return next();
});
router.use('/:channelId/messages', authorizeChannelRead, messageRoutes);

router.get('/:channelId/search', authorizeChannelRead, validate(searchMessagesSchema), searchChannelMessagesHandler);
router.post('/:channelId/ack', authorizeChannelRead, validate(ackChannelSchema), ackChannelHandler);

router.get('/:channelId/notification-settings', authorizeChannelRead, asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const { channelId } = req.params as any;

  const existing = await UserChannelNotificationSetting.findOne({ userId: req.user.id, channelId }).select('level').lean();
  res.status(200).json({ level: existing?.level || 'DEFAULT' });
}));

router.put(
  '/:channelId/notification-settings',
  authorizeChannelRead,
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
