import { Router } from 'express';
import * as rbacController from '../controllers/rbac.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Public registration endpoint for employees
router.post('/register', rbacController.registerEmployee);

// Authenticated user permission checks
router.get('/pages', authenticate, rbacController.getSystemPages);
router.get('/my-permissions', authenticate, rbacController.getMyPermissions);

// Admin-only RBAC management routes
router.use(authenticate, requireRole('ADMIN'));

router.get('/employees', rbacController.getEmployees);
router.get('/employees/:id', rbacController.getEmployeeById);
router.put('/employees/:id/permissions', rbacController.updatePermissions);
router.patch('/employees/:id/status', rbacController.updateStatus);
router.get('/logs', rbacController.getAuditLogs);

export default router;
