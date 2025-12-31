import { Router } from 'express';
import {
  createServerHandler,
  deleteServerHandler,
  getServerHandler,
  updateServerHandler,
  updateServerIconHandler,
} from './server.controller';
import channelRoutes from '../channel/channel.routes';
import inviteRoutes from '../invite/invite.routes';
import memberRoutes from '../member/member.routes';
import searchRoutes from '../search/search.routes';
import botInviteRoutes from '../botInvite/botInvite.routes';
import stickerRoutes from '../sticker/sticker.routes';

import { protect } from '../../middleware/auth';
import { authorizeServer } from '../../middleware/checkPermission';
import { checkServerMembership } from '../../middleware/memberAuth';
import { uploadImage } from '../../middleware/upload';

import validate from '../../middleware/validate';
import { createServerSchema, updateServerSchema } from './server.validation';

const router = Router();

router.use(protect);

router.post('/', validate(createServerSchema), createServerHandler);
router.get('/:serverId', checkServerMembership, getServerHandler);

router.patch(
  '/:serverId',
  checkServerMembership,
  authorizeServer('MANAGE_SERVER'),
  validate(updateServerSchema),
  updateServerHandler
);

router.delete('/:serverId', checkServerMembership, authorizeServer('ADMINISTRATOR'), deleteServerHandler);

router.post(
  '/:serverId/icon',
  checkServerMembership,
  authorizeServer('MANAGE_SERVER'),
  uploadImage.single('icon'),
  updateServerIconHandler
);

router.use('/:serverId/channels', channelRoutes);
router.use('/:serverId/invites', inviteRoutes);
router.use('/:serverId/members', memberRoutes);
router.use('/:serverId/stickers', stickerRoutes);
router.use('/:serverId/search', checkServerMembership, searchRoutes);
router.use('/:serverId/bots', botInviteRoutes);

export default router;
