import { Router } from 'express';
import { createServerHandler } from './server.controller';
import { protect } from '../../middleware/auth';
import validate from '../../middleware/validate';
import { createServerSchema } from './server.validation';

const router = Router();

// All routes in this file are protected
router.use(protect);

router.post('/', validate(createServerSchema), createServerHandler);

export default router;
