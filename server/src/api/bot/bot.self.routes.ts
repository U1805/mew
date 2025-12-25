import { Router } from 'express';
import { protect } from '../../middleware/auth';
import validate from '../../middleware/validate';
import { updateBotConfigAsBotHandler } from './bot.self.controller';
import { updateBotConfigAsBotSchema } from './bot.self.validation';

const router = Router();

router.use(protect);

router.patch('/:botId/config', validate(updateBotConfigAsBotSchema), updateBotConfigAsBotHandler);

export default router;

