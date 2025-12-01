import { Router } from 'express';
import * as WebhookController from './webhook.controller';

const router = Router();

router.post('/:webhookId/:token', WebhookController.executeWebhook);

export default router;
