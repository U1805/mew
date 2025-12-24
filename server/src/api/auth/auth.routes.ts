import { Router } from 'express';
import { getAuthConfigHandler, registerHandler, loginHandler, botLoginHandler } from './auth.controller';
import validate from '../../middleware/validate';
import { registerSchema, loginSchema, botLoginSchema } from './auth.validation';

const router = Router();

router.get('/config', getAuthConfigHandler);
router.post('/register', validate(registerSchema), registerHandler);
router.post('/login', validate(loginSchema), loginHandler);
router.post('/bot', validate(botLoginSchema), botLoginHandler);

export default router;

