import { Router } from 'express';
import { createDmChannelHandler, getDmChannelsHandler, getMeHandler, searchUsersHandler, getUserByIdHandler, updateMeHandler, changePasswordHandler } from './user.controller';
import { changePasswordSchema } from './user.validation';
import validate from '../../middleware/validate';
import { getUserServersHandler } from '../server/server.controller';
import { protect } from '../../middleware/auth';
import { uploadImage } from '../../middleware/upload';

const router = Router();

// All routes in this file are protected
router.use(protect);

router.route('/@me').get(getMeHandler).patch(uploadImage.single('avatar'), updateMeHandler);
router.get('/@me/servers', getUserServersHandler);
router.get('/@me/channels', getDmChannelsHandler);
router.post('/@me/channels', createDmChannelHandler);
router.post('/@me/password', validate(changePasswordSchema), changePasswordHandler);
router.get('/search', searchUsersHandler);
router.get('/:userId', getUserByIdHandler);

export default router;
