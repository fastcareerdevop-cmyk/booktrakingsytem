import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { User, RbacAuditLog } from '../src/models';

describe('RBAC (Role-Based Access Control) Integration Tests', () => {
  let adminToken = '';
  let employeeToken = '';
  let testEmployeeId = '';
  const testEmail = `test.employee.${Date.now()}@example.com`;
  const testEmpCode = `EMP-TEST-${Math.floor(Math.random() * 9000 + 1000)}`;

  beforeAll(async () => {
    await connectDatabase();

    // Login as Admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin@123' });

    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.data.token;
  });

  afterAll(async () => {
    // Cleanup created test user and audit logs
    if (testEmployeeId) {
      await User.findByIdAndDelete(testEmployeeId);
      await RbacAuditLog.deleteMany({ targetUserId: testEmployeeId });
    }
    await disconnectDatabase();
  });

  describe('1. Employee Registration Workflow', () => {
    it('should successfully register a new employee with Pending Access status by default', async () => {
      const res = await request(app)
        .post('/api/rbac/register')
        .send({
          name: 'Vikram Malhotra',
          employeeId: testEmpCode,
          email: testEmail,
          mobileNumber: '9876543210',
          department: 'Dispatch & Outgoing',
          designation: 'Dispatch Executive',
          password: 'Password@123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Vikram Malhotra');
      expect(res.body.data.employeeId).toBe(testEmpCode);
      expect(res.body.data.role).toBe('EMPLOYEE');
      expect(res.body.data.accessStatus).toBe('PENDING');
      expect(res.body.data.permissions).toEqual([]);

      testEmployeeId = res.body.data.id;

      // Verify audit log created
      const auditEntry = await RbacAuditLog.findOne({ targetUserId: testEmployeeId });
      expect(auditEntry).toBeDefined();
      expect(auditEntry?.action).toBe('EMPLOYEE_REGISTERED');
      expect(auditEntry?.newStatus).toBe('PENDING');
    });

    it('should reject duplicate email during registration', async () => {
      const res = await request(app)
        .post('/api/rbac/register')
        .send({
          name: 'Another User',
          employeeId: `EMP-DIFF-${Math.floor(Math.random() * 8000 + 1000)}`,
          email: testEmail,
          mobileNumber: '9123456780',
          department: 'Warehouse & Inventory',
          designation: 'Supervisor',
          password: 'Password@123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMAIL_EXISTS');
    });

    it('should reject duplicate Employee ID during registration', async () => {
      const res = await request(app)
        .post('/api/rbac/register')
        .send({
          name: 'Another User',
          employeeId: testEmpCode,
          email: `unique.${Date.now()}@example.com`,
          mobileNumber: '9123456780',
          department: 'Warehouse & Inventory',
          designation: 'Supervisor',
          password: 'Password@123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMPLOYEE_ID_EXISTS');
    });

    it('newly registered employee should have PENDING access and empty permissions on login', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'Password@123' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.accessStatus).toBe('PENDING');
      expect(loginRes.body.data.user.permissions).toEqual([]);
      employeeToken = loginRes.body.data.token;
    });

    it('should block pending employee from protected dispatch operations with 403', async () => {
      const res = await request(app)
        .post('/api/dispatch/verify')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ orderItemId: 'some-id', enteredBookCode: 'SOME-CODE' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCESS_PENDING_APPROVAL');
    });
  });

  describe('2. Admin Employee Access Management & Page-Level RBAC', () => {
    it('admin should be able to view registered employees list including pending employee', async () => {
      const res = await request(app)
        .get('/api/rbac/employees')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const found = res.body.data.find((e: any) => e.id === testEmployeeId);
      expect(found).toBeDefined();
      expect(found.accessStatus).toBe('PENDING');
      expect(found.permissions).toEqual([]);
    });

    it('admin can search employees by employee ID or name', async () => {
      const res = await request(app)
        .get(`/api/rbac/employees?search=${testEmpCode}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].employeeId).toBe(testEmpCode);
    });

    it('admin can filter employees by department and access status', async () => {
      const res = await request(app)
        .get('/api/rbac/employees?department=Dispatch%20%26%20Outgoing&status=PENDING')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const match = res.body.data.find((e: any) => e.id === testEmployeeId);
      expect(match).toBeDefined();
    });

    it('non-admin employee cannot access admin RBAC employee list', async () => {
      const res = await request(app)
        .get('/api/rbac/employees')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });

    it('admin should be able to grant page permissions and activate employee', async () => {
      const pagesToGrant = ['dashboard', 'dispatch_entry', 'available_stock'];
      const res = await request(app)
        .put(`/api/rbac/employees/${testEmployeeId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          permissions: pagesToGrant,
          accessStatus: 'ACTIVE',
          remarks: 'Approved for morning dispatch team',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.permissions).toEqual(pagesToGrant);
      expect(res.body.data.accessStatus).toBe('ACTIVE');

      // Verify in DB
      const updatedUser = await User.findById(testEmployeeId);
      expect(updatedUser?.accessStatus).toBe('ACTIVE');
      expect(updatedUser?.permissions).toEqual(pagesToGrant);

      // Verify RBAC audit log entry
      const log = await RbacAuditLog.findOne({
        targetUserId: testEmployeeId,
        action: 'PERMISSIONS_UPDATED',
      }).sort({ createdAt: -1 });
      expect(log).toBeDefined();
      expect(log?.previousStatus).toBe('PENDING');
      expect(log?.newStatus).toBe('ACTIVE');
      expect(log?.newPermissions).toEqual(pagesToGrant);
      expect(log?.remarks).toBe('Approved for morning dispatch team');
    });

    it('employee /auth/me should reflect newly granted permissions immediately', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.accessStatus).toBe('ACTIVE');
      expect(res.body.data.permissions).toEqual(['dashboard', 'dispatch_entry', 'available_stock']);
    });

    it('employee cannot update own permissions (forbidden)', async () => {
      const res = await request(app)
        .put(`/api/rbac/employees/${testEmployeeId}/permissions`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          permissions: ['dashboard', 'rbac', 'all_orders'],
        });

      expect(res.status).toBe(403);
    });

    it('admin can revoke permissions or set status to RESTRICTED', async () => {
      const res = await request(app)
        .patch(`/api/rbac/employees/${testEmployeeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          accessStatus: 'RESTRICTED',
          remarks: 'Temporary suspension',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.accessStatus).toBe('RESTRICTED');

      // Check restricted employee is blocked from operations
      const blockedRes = await request(app)
        .post('/api/dispatch/verify')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ orderItemId: 'some-id', enteredBookCode: 'SOME-CODE' });

      expect(blockedRes.status).toBe(403);
      expect(['ACCESS_RESTRICTED', 'ACCOUNT_DEACTIVATED']).toContain(blockedRes.body.code);
    });

    it('admin can view complete RBAC access audit logs', async () => {
      const res = await request(app)
        .get(`/api/rbac/logs?search=${testEmpCode}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.logs.length).toBeGreaterThanOrEqual(2);
    });

    it('system pages catalog endpoint returns all 18 pages', async () => {
      const res = await request(app)
        .get('/api/rbac/pages')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(18);
    });
  });
});
