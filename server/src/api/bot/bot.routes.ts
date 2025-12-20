import { Router } from 'express';
import { protect } from '../../middleware/auth';
import validate from '../../middleware/validate';
import { uploadImage } from '../../middleware/upload';
import { createBotSchema, updateBotSchema } from './bot.validation';
import {
  createBotHandler,
  getBotsHandler,
  getBotHandler,
  updateBotHandler,
  deleteBotHandler,
  regenerateTokenHandler,
} from './bot.controller';

const router = Router();

// All bot routes are protected
router.use(protect);

router.route('/')
  .get(getBotsHandler)
  .post(uploadImage.single('avatar'), validate(createBotSchema), createBotHandler);

router.route('/:botId')
  .get(getBotHandler)
  .patch(uploadImage.single('avatar'), validate(updateBotSchema), updateBotHandler)
  .delete(deleteBotHandler);

router.post('/:botId/token', regenerateTokenHandler);

export default router;
