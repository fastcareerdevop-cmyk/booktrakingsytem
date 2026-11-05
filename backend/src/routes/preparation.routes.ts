import { Router } from 'express';
import * as preparationController from '../controllers/preparation.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { requireActiveAccess } from '../middleware/rbac';

const router = Router();

router.use(authenticate, requireActiveAccess());

// Accessible by both ADMIN and EMPLOYEE
router.get('/products', requireRole('ADMIN', 'EMPLOYEE'), preparationController.getProducts);
router.post('/pack-batch', requireRole('ADMIN', 'EMPLOYEE'), preparationController.packBatch);
router.get('/stock-summary', requireRole('ADMIN', 'EMPLOYEE'), preparationController.getStockSummary);
router.post('/dispatch-v2', requireRole('ADMIN', 'EMPLOYEE'), preparationController.dispatchPackageV2);
router.post('/update-stock', requireRole('ADMIN', 'EMPLOYEE'), preparationController.updatePackagedStock);
router.post('/reset-stock', requireRole('ADMIN', 'EMPLOYEE'), preparationController.resetPackagedStock);

export default router;
