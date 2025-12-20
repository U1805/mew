import { Router } from 'express';
import { protect } from '../../middleware/auth';
import * as WebhookController from './webhook.controller';

const router = Router({ mergeParams: true });

router.use(protect);

router.route('/')
  .get(WebhookController.getWebhooks)
  .post(WebhookController.createWebhook);

router.route('/:webhookId')
  .patch(WebhookController.updateWebhook)
  .delete(WebhookController.deleteWebhook);

export default router;
