import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { User, Order, ImportBatch, SecuritySetting } from '../src/models';
import jwt from 'jsonwebtoken';
import { ENV } from '../src/config/env';

describe('Admin Security PIN & Order Edit Integration Tests', () => {
  let adminToken: string;
  let employeeToken: string;
  let adminUser: any;
  let employeeUser: any;
  let testOrder: any;
  let testBatch: any;

  beforeAll(async () => {
    await connectDatabase();

    // Clean up test security settings
    await SecuritySetting.deleteMany({});

    // Setup Admin
    adminUser = await User.findOne({ role: 'ADMIN' });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Super Admin',
        email: 'security-admin@example.com',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: 'ADMIN',
        accessStatus: 'ACTIVE',
      });
    }
    adminToken = jwt.sign(
      { id: adminUser._id.toString(), email: adminUser.email, role: 'ADMIN', name: adminUser.name },
      ENV.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Setup Employee
    employeeUser = await User.findOne({ role: 'EMPLOYEE' });
    if (!employeeUser) {
      employeeUser = await User.create({
        name: 'Staff Member',
        email: 'security-employee@example.com',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: 'EMPLOYEE',
        accessStatus: 'ACTIVE',
        permissions: ['OUTGOING'],
      });
    }
    employeeToken = jwt.sign(
      { id: employeeUser._id.toString(), email: employeeUser.email, role: 'EMPLOYEE', name: employeeUser.name },
      ENV.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create a test batch & order
    testBatch = await ImportBatch.create({
      originalFileName: 'test_security.xlsx',
      fileHash: 'test_hash_security_12345',
      uploadedByUserId: adminUser._id,
      uploadedByUserName: adminUser.name,
      totalRows: 1,
      successfulRows: 1,
      failedRows: 0,
      validationErrors: [],
    });

    testOrder = await Order.create({
      importBatchId: testBatch._id,
      orderCode: 'ORD-9999-00001',
      studentName: 'Original Student Name',
      mobileNumber: '9999999999',
      email: 'original@example.com',
      trackingId: 'TRK-ORIGINAL-01',
      productCode: 'PROD-ORIGINAL',
      items: [
        {
          bookCode: 'SEC-BK-01',
          bookName: 'Original Book 1',
          requiredQuantity: 2,
          dispatchedQuantity: 0,
          pendingQuantity: 2,
          status: 'PENDING',
        },
      ],
    });
  });

  afterAll(async () => {
    if (testOrder) await Order.findByIdAndDelete(testOrder._id);
    if (testBatch) await ImportBatch.findByIdAndDelete(testBatch._id);
    await SecuritySetting.deleteMany({});
    await disconnectDatabase();
  });

  describe('1. Security PIN Management (/api/security)', () => {
    it('should report PIN as not configured initially', async () => {
      const res = await request(app)
        .get('/api/security/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isConfigured).toBe(false);
    });

    it('should reject non-admin users from setting PIN', async () => {
      const res = await request(app)
        .post('/api/security/set-pin')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ pin: '1234' });

      expect(res.status).toBe(403);
    });

    it('should reject non-4-digit PINs', async () => {
      const res = await request(app)
        .post('/api/security/set-pin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pin: '123' }); // Only 3 digits

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('4 numeric digits');
    });

    it('should allow Admin to set a valid 4-digit PIN', async () => {
      const res = await request(app)
        .post('/api/security/set-pin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pin: '4589' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const statusRes = await request(app)
        .get('/api/security/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statusRes.body.data.isConfigured).toBe(true);
    });

    it('should successfully verify the correct 4-digit PIN', async () => {
      const res = await request(app)
        .post('/api/security/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pin: '4589' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verified).toBe(true);
    });

    it('should reject an incorrect PIN', async () => {
      const res = await request(app)
        .post('/api/security/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pin: '0000' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Incorrect Security PIN');
    });
  });

  describe('2. Order Edit with PIN Authorization (/api/orders/:id)', () => {
    it('should reject order edit if wrong PIN is provided', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pin: '0000',
          studentName: 'Hacked Name',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Incorrect Security PIN');

      // Verify DB unchanged
      const freshOrder = await Order.findById(testOrder._id);
      expect(freshOrder!.studentName).toBe('Original Student Name');
    });

    it('should reject order edit if PIN is omitted', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentName: 'No PIN Name',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PIN_REQUIRED');
    });

    it('should reject order edit by non-admin employee even with PIN', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          pin: '4589',
          studentName: 'Employee Edited Name',
        });

      expect(res.status).toBe(403);
    });

    it('should successfully update order details when Admin provides valid PIN', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pin: '4589',
          studentName: 'Vikram Aditya Sharma',
          mobileNumber: '9811223344',
          email: 'vikram.aditya@example.com',
          trackingId: 'TRK-VIKRAM-99',
          productCode: 'PROD-FINAL-LAW',
          items: [
            {
              bookCode: 'LAW-VOL-1',
              bookName: 'Corporate Law Volume 1',
              requiredQuantity: 1,
              dispatchedQuantity: 0,
            },
            {
              bookCode: 'LAW-VOL-2',
              bookName: 'Corporate Law Volume 2',
              requiredQuantity: 1,
              dispatchedQuantity: 0,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify changes persisted in database
      const updated = await Order.findById(testOrder._id);
      expect(updated!.studentName).toBe('Vikram Aditya Sharma');
      expect(updated!.mobileNumber).toBe('9811223344');
      expect(updated!.email).toBe('vikram.aditya@example.com');
      expect(updated!.trackingId).toBe('TRK-VIKRAM-99');
      expect(updated!.productCode).toBe('PROD-FINAL-LAW');
      expect(updated!.items.length).toBe(2);
      expect(updated!.items[0].bookCode).toBe('LAW-VOL-1');
      expect(updated!.items[1].bookCode).toBe('LAW-VOL-2');
    });
  });

  describe('3. PIN Protection for Manual Dispatch Actions', () => {
    it('should reject manual finish without PIN when PIN is configured', async () => {
      const res = await request(app)
        .post('/api/dispatch/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'MANUAL_FINISH_ORDER',
          orderId: testOrder._id.toString(),
          // PIN omitted
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PIN_REQUIRED');
    });

    it('should reject manual finish with wrong PIN', async () => {
      const res = await request(app)
        .post('/api/dispatch/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'MANUAL_FINISH_ORDER',
          orderId: testOrder._id.toString(),
          pin: '9999',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Incorrect Security PIN');
    });

    it('should succeed manual finish when correct PIN is provided', async () => {
      const res = await request(app)
        .post('/api/dispatch/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'MANUAL_FINISH_ORDER',
          orderId: testOrder._id.toString(),
          pin: '4589',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('4. Tracking ID Verification & Matching (/api/dispatch/verify)', () => {
    let trackingOrder: any;

    beforeAll(async () => {
      trackingOrder = await Order.create({
        importBatchId: testBatch._id,
        orderCode: 'ORD-TRACK-001',
        studentName: 'Aarav Mehta',
        mobileNumber: '9123456780',
        email: 'aarav@example.com',
        trackingId: 'DTDC-12345678',
        productCode: 'PROD-CA-FOUNDATION',
        items: [
          {
            bookCode: 'AARAV-BK-01',
            bookName: 'Accounting Vol 1',
            requiredQuantity: 1,
            dispatchedQuantity: 1, // Already verified on table!
            pendingQuantity: 0,
            status: 'COMPLETED',
          },
        ],
      });
    });

    afterAll(async () => {
      if (trackingOrder) await Order.findByIdAndDelete(trackingOrder._id);
    });

    it('should match exact tracking ID even if order items are already completed', async () => {
      const res = await request(app)
        .post('/api/dispatch/verify')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          action: 'CONFIRM_DISPATCH_WITH_TRACKING',
          orderId: trackingOrder._id.toString(),
          trackingCode: 'DTDC-12345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scanType).toBe('TRACKING_MATCHED_AND_DISPATCHED');
    });

    it('should match tracking ID ignoring hyphens, spaces, and case', async () => {
      const res = await request(app)
        .post('/api/dispatch/verify')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          action: 'CONFIRM_DISPATCH_WITH_TRACKING',
          orderId: trackingOrder._id.toString(),
          trackingCode: '  dtdc 12345678  ',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scanType).toBe('TRACKING_MATCHED_AND_DISPATCHED');
    });

    it('should match tracking ID with courier barcode prefix (e.g. ]C1 or AWB:)', async () => {
      const res = await request(app)
        .post('/api/dispatch/verify')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          action: 'CONFIRM_DISPATCH_WITH_TRACKING',
          orderId: trackingOrder._id.toString(),
          trackingCode: ']C1DTDC12345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scanType).toBe('TRACKING_MATCHED_AND_DISPATCHED');
    });

    it('should resolve order automatically from database even if orderId was not provided', async () => {
      const res = await request(app)
        .post('/api/dispatch/verify')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          action: 'CONFIRM_DISPATCH_WITH_TRACKING',
          // orderId omitted on purpose!
          trackingCode: 'DTDC12345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.order.id).toBe(trackingOrder._id.toString());
    });

    it('should reject completely unrelated tracking ID', async () => {
      const res = await request(app)
        .post('/api/dispatch/verify')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          action: 'CONFIRM_DISPATCH_WITH_TRACKING',
          orderId: trackingOrder._id.toString(),
          trackingCode: 'COMPLETELY_WRONG_AWB_99999',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TRACKING_ID_MISMATCH');
    });

    it('should NOT complete Order B when scanning Order B tracking code while Order A is active', async () => {
      // Create separate Order B in pending state
      const orderB = await Order.create({
        orderCode: '131126099',
        studentName: 'Other Student B',
        mobileNumber: '9988776655',
        importBatchId: new mongoose.Types.ObjectId(),
        trackingId: 'D1020119999',
        productCode: 'PROD-B',
        items: [
          {
            bookCode: 'TEST-B-01',
            bookName: 'Book B',
            requiredQuantity: 1,
            dispatchedQuantity: 0,
            pendingQuantity: 1,
            status: 'PENDING',
          },
        ],
      });

      try {
        // While Order A (trackingOrder) is active on screen, operator scans Order B's tracking ID
        const res = await request(app)
          .post('/api/dispatch/verify')
          .set('Authorization', `Bearer ${employeeToken}`)
          .send({
            action: 'CONFIRM_DISPATCH_WITH_TRACKING',
            orderId: trackingOrder._id.toString(), // Order A
            trackingCode: 'D1020119999', // Order B's tracking ID!
          });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('TRACKING_ID_MISMATCH');

        // Verify Order B was NOT silently completed in the database!
        const refreshedB = await Order.findById(orderB._id);
        expect(refreshedB!.items[0].dispatchedQuantity).toBe(0);
      } finally {
        await Order.findByIdAndDelete(orderB._id);
      }
    });
  });
});
