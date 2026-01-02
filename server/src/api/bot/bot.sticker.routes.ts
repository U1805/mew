import { Router } from 'express';
import { uploadImage } from '../../middleware/upload';
import {
  createBotStickerHandler,
  deleteBotStickerHandler,
  listBotStickersHandler,
  updateBotStickerHandler,
} from './bot.sticker.controller';

const router = Router({ mergeParams: true });

router.get('/', listBotStickersHandler);
router.post('/', uploadImage.single('file'), createBotStickerHandler);
router.patch('/:stickerId', updateBotStickerHandler);
router.delete('/:stickerId', deleteBotStickerHandler);

export default router;
