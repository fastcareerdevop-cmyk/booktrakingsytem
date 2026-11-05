import { Router } from 'express';
import authRoutes from './auth.routes';
import dashboardRoutes from './dashboard.routes';
import importRoutes from './import.routes';
import orderRoutes from './order.routes';
import dispatchRoutes from './dispatch.routes';
import reportRoutes from './report.routes';
import employeeRoutes from './employee.routes';
import auditRoutes from './audit.routes';
import scannerSyncRoutes from './scannerSync.routes';
import stockRoutes from './stock.routes';
import preparationRoutes from './preparation.routes';
import rbacRoutes from './rbac.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/imports', importRoutes);
router.use('/orders', orderRoutes);
router.use('/dispatch', dispatchRoutes);
router.use('/reports', reportRoutes);
router.use('/employees', employeeRoutes);
router.use('/audit', auditRoutes);
router.use('/scanner-sync', scannerSyncRoutes);
router.use('/stock', stockRoutes);
router.use('/preparation', preparationRoutes);
router.use('/rbac', rbacRoutes);

export default router;
