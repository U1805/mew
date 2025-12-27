import { Router } from 'express';
import { authorizeChannel } from '../../middleware/checkPermission';
import { uploadAttachment } from '../../middleware/upload';
import * as uploadController from './upload.controller';

const router = Router({ mergeParams: true });

// Route: /api/channels/:channelId/uploads
router.post('/presign', authorizeChannel('ATTACH_FILES'), uploadController.presignUploadHandler);

router.post(
  '/',
  authorizeChannel('ATTACH_FILES'),
  uploadAttachment.single('file'),
  uploadController.uploadFileHandler
);

// Download attachment by key (useful for bot services in Docker where S3 public domain may be host-only).
router.get('/:key', authorizeChannel('SEND_MESSAGES'), uploadController.downloadFileHandler);

export default router;
