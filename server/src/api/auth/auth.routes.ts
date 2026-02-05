import { Router } from 'express';
import {
  getAuthConfigHandler,
  registerHandler,
  registerCookieHandler,
  loginHandler,
  loginCookieHandler,
  botLoginHandler,
  refreshHandler,
  refreshCookieHandler,
  logoutHandler,
} from './auth.controller';
import validate from '../../middleware/validate';
import { registerSchema, loginSchema, botLoginSchema } from './auth.validation';

const router = Router();

router.get('/config', getAuthConfigHandler);
router.post('/register', validate(registerSchema), registerHandler);
router.post('/register-cookie', validate(registerSchema), registerCookieHandler);
router.post('/login', validate(loginSchema), loginHandler);
router.post('/login-cookie', validate(loginSchema), loginCookieHandler);
router.post('/bot', validate(botLoginSchema), botLoginHandler);
router.post('/refresh', refreshHandler);
router.post('/refresh-cookie', refreshCookieHandler);
router.post('/logout', logoutHandler);

export default router;

