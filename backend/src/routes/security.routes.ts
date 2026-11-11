import { Router } from 'express';
import * as securityController from '../controllers/security.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Status check (accessible to authenticated users)
router.get('/status', securityController.getStatus);

// Verify PIN endpoint
router.post('/verify', securityController.verifyPin);

// Set or update 4-digit PIN (Admin only)
router.post('/set-pin', requireRole('ADMIN'), securityController.setPin);

export default router;
