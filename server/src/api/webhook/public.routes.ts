import { Router } from 'express';
import { uploadAttachment } from '../../middleware/upload';
import * as WebhookController from './webhook.controller';

const router = Router();

router.post('/:webhookId/:token', WebhookController.executeWebhook);
router.post('/:webhookId/:token/presign', WebhookController.presignWebhookFile);
router.post(
  '/:webhookId/:token/upload',
  uploadAttachment.single('file'),
  WebhookController.uploadWebhookFile
);

export default router;
