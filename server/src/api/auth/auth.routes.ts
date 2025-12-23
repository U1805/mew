import { Router } from 'express';
import { getAuthConfigHandler, registerHandler, loginHandler } from './auth.controller';
import validate from '../../middleware/validate';
import { registerSchema, loginSchema } from './auth.validation';

const router = Router();

router.get('/config', getAuthConfigHandler);
router.post('/register', validate(registerSchema), registerHandler);
router.post('/login', validate(loginSchema), loginHandler);

export default router;

