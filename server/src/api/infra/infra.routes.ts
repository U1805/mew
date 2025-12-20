import { Router } from 'express';
import { protect } from '../../middleware/auth';
import { infraIpOnly } from '../../middleware/infraIpOnly';
import { verifyAdminSecret } from '../../middleware/verifyAdminSecret';
import { getAvailableServicesHandler, registerServiceTypeHandler } from './infra.controller';

const router = Router();

router.post('/service-types/register', infraIpOnly, verifyAdminSecret, registerServiceTypeHandler);

router.use(protect);
router.get('/available-services', getAvailableServicesHandler);

export default router;
