import { Router } from 'express';
import { protect } from '../../middleware/auth';
import { checkServerMembership } from '../../middleware/memberAuth';
import { authorizeServer } from '../../middleware/checkPermission';
import { uploadImage } from '../../middleware/upload';
import {
  createStickerHandler,
  deleteStickerHandler,
  listStickersHandler,
  updateStickerHandler,
} from './sticker.controller';

const router = Router({ mergeParams: true });

router.use(protect, checkServerMembership);

router.get('/', listStickersHandler);

router.post('/', authorizeServer('MANAGE_STICKERS'), uploadImage.single('file'), createStickerHandler);
router.patch('/:stickerId', authorizeServer('MANAGE_STICKERS'), updateStickerHandler);
router.delete('/:stickerId', authorizeServer('MANAGE_STICKERS'), deleteStickerHandler);

export default router;

