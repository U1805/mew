import { Router } from 'express';
import {
  createDmChannelHandler,
  getDmChannelsHandler,
  getMeHandler,
  getMyChannelNotificationSettingsHandler,
  getMyNotificationSettingsHandler,
  searchUsersHandler,
  getUserByIdHandler,
  updateMeHandler,
  updateMyNotificationSettingsHandler,
  changePasswordHandler
} from './user.controller';
import { changePasswordSchema, updateMeSchema, updateMyNotificationSettingsSchema } from './user.validation';
import validate from '../../middleware/validate';
import { getUserServersHandler } from '../server/server.controller';
import { protect } from '../../middleware/auth';
import { uploadImage } from '../../middleware/upload';
import botRoutes from '../bot/bot.routes';
import userStickerRoutes from '../userSticker/userSticker.routes';

const router = Router();

// All routes in this file are protected
router.use(protect);

router.route('/@me').get(getMeHandler).patch(uploadImage.single('avatar'), validate(updateMeSchema), updateMeHandler);
router.route('/@me/notification-settings')
  .get(getMyNotificationSettingsHandler)
  .put(validate(updateMyNotificationSettingsSchema), updateMyNotificationSettingsHandler);
router.get('/@me/channel-notification-settings', getMyChannelNotificationSettingsHandler);
router.get('/@me/servers', getUserServersHandler);
router.get('/@me/channels', getDmChannelsHandler);
router.post('/@me/channels', createDmChannelHandler);
router.post('/@me/password', validate(changePasswordSchema), changePasswordHandler);
router.use('/@me/bots', botRoutes);
router.use('/@me/stickers', userStickerRoutes);
router.get('/search', searchUsersHandler);
router.get('/:userId', getUserByIdHandler);

export default router;
