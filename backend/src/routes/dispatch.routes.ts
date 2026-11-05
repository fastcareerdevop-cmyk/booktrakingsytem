import { Router } from 'express';
import * as dispatchController from '../controllers/dispatch.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { dispatchRateLimiter } from '../middleware/rateLimiter';
import { requireActiveAccess, requirePagePermission } from '../middleware/rbac';
const router = Router();

router.use(authenticate, requireActiveAccess());

// Dispatch verification is used by Employees & Admin
router.post('/verify', requireRole('EMPLOYEE', 'ADMIN'), requirePagePermission('dispatch_entry'), dispatchRateLimiter, dispatchController.verifyAndDispatch);

// Personal dispatch history for employee/admin
router.get('/my-history', requireRole('EMPLOYEE', 'ADMIN'), dispatchController.getMyHistory);

// Admin-only global dispatch history & failed verification attempts
router.get('/history', requireRole('ADMIN'), dispatchController.getHistory);
router.get('/stock-history', requireRole('ADMIN', 'EMPLOYEE'), dispatchController.getStockDispatchHistory);
router.get('/failed-attempts', requireRole('ADMIN'), dispatchController.getFailedAttempts);

export default router;
