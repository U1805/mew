import { Router } from 'express';
import { verifyAdminSecret } from '../../middleware/verifyAdminSecret';
import { infraIpOnly } from '../../middleware/infraIpOnly';
import { bootstrapBotByIdHandler, bootstrapBotsHandler } from './bot.bootstrap.controller';

const router = Router();

router.post('/bootstrap', infraIpOnly, verifyAdminSecret, bootstrapBotsHandler);
router.get('/:botId/bootstrap', infraIpOnly, verifyAdminSecret, bootstrapBotByIdHandler);

export default router;
