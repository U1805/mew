import { Router } from 'express';
import { uploadImage } from '../../middleware/upload';
import {
  createMyStickerHandler,
  deleteMyStickerHandler,
  listMyStickersHandler,
  updateMyStickerHandler,
} from './userSticker.controller';

const router = Router();

router.get('/', listMyStickersHandler);
router.post('/', uploadImage.single('file'), createMyStickerHandler);
router.patch('/:stickerId', updateMyStickerHandler);
router.delete('/:stickerId', deleteMyStickerHandler);

export default router;

