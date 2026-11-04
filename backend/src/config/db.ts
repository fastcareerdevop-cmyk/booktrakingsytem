import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ENV } from './env';
import { AuditLog, DispatchLog, ImportBatch, Order, ProductCatalog, User, VerificationAttempt } from '../models';

export async function seedDemoDataIfNeeded() {
  const demoTrackingIds = ['TR101', 'TR102', 'TR103', 'TR104'];
  const [ordersExists, batchesExists, logsExists, demoOrders] = await Promise.all([
    Order.estimatedDocumentCount(),
    ImportBatch.estimatedDocumentCount(),
    DispatchLog.estimatedDocumentCount(),
    Order.find({ trackingId: { $in: demoTrackingIds } }).lean(),
  ]);

  const hasPendingDemoOrder = demoOrders.some((order: any) =>
    Array.isArray(order.items) && order.items.some((item: any) => item.dispatchedQuantity < item.requiredQuantity)
  );

  const shouldSeedDemoData = ordersExists === 0 || (!hasPendingDemoOrder && demoOrders.length > 0);

  // Only skip when the DB has a real dataset. If the local demo batch is stale or fully completed,
  // we restore the original mixed-status seed so the app and tests keep a valid pending queue.
  if (!shouldSeedDemoData && (ordersExists > 0 || (batchesExists > 0 && logsExists > 0))) {
    return;
  }

  if (demoOrders.length > 0 && !hasPendingDemoOrder) {
    console.log('🔄 Rebuilding stale demo order dataset so outgoing orders remain in a valid pending state...');
    await Promise.all([
      DispatchLog.deleteMany({ orderId: { $in: demoOrders.map((o: any) => o._id) } }),
      VerificationAttempt.deleteMany({ orderId: { $in: demoOrders.map((o: any) => o._id) } }),
      AuditLog.deleteMany({ entityId: { $in: demoOrders.map((o: any) => o._id.toString()) } }),
      Order.deleteMany({ _id: { $in: demoOrders.map((o: any) => o._id) } }),
      ImportBatch.deleteMany({ originalFileName: 'Initial_Seed_Orders.xlsx' }),
    ]);
  }

  const existingOrdersCount = await Order.estimatedDocumentCount();
  if (existingOrdersCount > 0 && demoOrders.length === 0) {
    return;
  }

  console.log('🌱 Seeding demo orders and dispatch data for local development...');

  const admin = await User.findOne({ email: ENV.ADMIN_DEFAULT_EMAIL });
  const emp1 = await User.findOne({ email: 'emp1@example.com' });
  const emp2 = await User.findOne({ email: 'emp2@example.com' });

  if (!admin || !emp1 || !emp2) {
    return;
  }

  const initialBatch = await ImportBatch.create({
    originalFileName: 'Initial_Seed_Orders.xlsx',
    uploadedByUserId: admin._id,
    status: 'COMPLETED',
    totalRows: 6,
    validRows: 6,
    invalidRows: 0,
    importedRows: 6,
    fileHash: 'seed_batch_initial_hash_101',
    errorSummary: [],
  });

  const order1 = await Order.create({
    orderCode: 'ORD-0001',
    studentName: 'Rahul Sharma',
    mobileNumber: '9876543210',
    email: 'rahul@example.com',
    trackingId: 'TR101',
    importBatchId: initialBatch._id,
    items: [
      { bookCode: 'QB101', bookName: 'Quantitative Bank', requiredQuantity: 2, dispatchedQuantity: 1 },
      { bookCode: 'MCQ201', bookName: 'MCQ Book', requiredQuantity: 1, dispatchedQuantity: 1 },
    ],
  });

  const order2 = await Order.create({
    orderCode: 'ORD-0002',
    studentName: 'Priya Verma',
    mobileNumber: '9876543211',
    email: 'priya@example.com',
    trackingId: 'TR102',
    importBatchId: initialBatch._id,
    items: [{ bookCode: 'QB101', bookName: 'Quantitative Bank', requiredQuantity: 3, dispatchedQuantity: 0 }],
  });

  const order3 = await Order.create({
    orderCode: 'ORD-0003',
    studentName: 'Amit Patel',
    mobileNumber: '9876543212',
    email: 'amit@example.com',
    trackingId: 'TR103',
    importBatchId: initialBatch._id,
    items: [{ bookCode: 'MCQ201', bookName: 'MCQ Book', requiredQuantity: 2, dispatchedQuantity: 2 }],
  });

  const order4 = await Order.create({
    orderCode: 'ORD-0004',
    studentName: 'Sneha Roy',
    mobileNumber: '9876543213',
    email: 'sneha@example.com',
    trackingId: 'TR104',
    importBatchId: initialBatch._id,
    items: [
      { bookCode: 'QB101', bookName: 'Quantitative Bank', requiredQuantity: 1, dispatchedQuantity: 0 },
      { bookCode: 'CS301', bookName: 'Computer Science Handbook', requiredQuantity: 1, dispatchedQuantity: 0 },
    ],
  });

  const order1Qb101 = order1.items.find((i) => i.bookCode === 'QB101')!;
  const order1Mcq201 = order1.items.find((i) => i.bookCode === 'MCQ201')!;
  const order3Mcq201 = order3.items.find((i) => i.bookCode === 'MCQ201')!;

  await DispatchLog.create({
    orderId: order1._id,
    orderItemId: order1Qb101._id.toString(),
    employeeId: emp1._id,
    verifiedBookCode: 'QB101',
    quantity: 1,
    result: 'SUCCESS',
    requestId: 'req-seed-001',
    dispatchedAt: new Date(Date.now() - 3600 * 1000 * 2),
  });

  await DispatchLog.create({
    orderId: order1._id,
    orderItemId: order1Mcq201._id.toString(),
    employeeId: emp1._id,
    verifiedBookCode: 'MCQ201',
    quantity: 1,
    result: 'SUCCESS',
    requestId: 'req-seed-002',
    dispatchedAt: new Date(Date.now() - 3600 * 1000 * 1.5),
  });

  await DispatchLog.create({
    orderId: order3._id,
    orderItemId: order3Mcq201._id.toString(),
    employeeId: emp2._id,
    verifiedBookCode: 'MCQ201',
    quantity: 1,
    result: 'SUCCESS',
    requestId: 'req-seed-003',
    dispatchedAt: new Date(Date.now() - 3600 * 1000 * 1),
  });

  await DispatchLog.create({
    orderId: order3._id,
    orderItemId: order3Mcq201._id.toString(),
    employeeId: emp2._id,
    verifiedBookCode: 'MCQ201',
    quantity: 1,
    result: 'SUCCESS',
    requestId: 'req-seed-004',
    dispatchedAt: new Date(Date.now() - 3600 * 1000 * 0.5),
  });

  await VerificationAttempt.insertMany([
    {
      orderId: order1._id,
      orderItemId: order1Qb101._id.toString(),
      employeeId: emp1._id,
      enteredBookCode: 'QB101',
      success: true,
      attemptedAt: new Date(Date.now() - 3600 * 1000 * 2),
    },
    {
      orderId: order1._id,
      orderItemId: order1Qb101._id.toString(),
      employeeId: emp1._id,
      enteredBookCode: 'WRONG_CODE_99',
      success: false,
      failureReason: 'Entered book code "WRONG_CODE_99" does not match expected "QB101"',
      attemptedAt: new Date(Date.now() - 3600 * 1000 * 2.1),
    },
    {
      orderId: order1._id,
      orderItemId: order1Mcq201._id.toString(),
      employeeId: emp1._id,
      enteredBookCode: 'MCQ201',
      success: true,
      attemptedAt: new Date(Date.now() - 3600 * 1000 * 1.5),
    },
    {
      orderId: order2._id,
      orderItemId: order2.items[0]._id.toString(),
      employeeId: emp2._id,
      enteredBookCode: 'MCQ201',
      success: false,
      failureReason: 'Entered book code "MCQ201" does not match expected "QB101"',
      attemptedAt: new Date(Date.now() - 3600 * 1000 * 0.8),
    },
  ]);

  await AuditLog.insertMany([
    {
      actorUserId: admin._id,
      action: 'IMPORT_BATCH_CREATED',
      entityType: 'ImportBatch',
      entityId: initialBatch._id.toString(),
      metadata: { fileName: 'Initial_Seed_Orders.xlsx', totalRows: 6 },
    },
    {
      actorUserId: emp1._id,
      action: 'BOOK_DISPATCHED',
      entityType: 'OrderItem',
      entityId: order1Qb101._id.toString(),
      metadata: { bookCode: 'QB101', quantity: 1, student: 'Rahul Sharma' },
    },
    {
      actorUserId: emp2._id,
      action: 'BOOK_DISPATCHED',
      entityType: 'OrderItem',
      entityId: order3Mcq201._id.toString(),
      metadata: { bookCode: 'MCQ201', quantity: 1, student: 'Amit Patel' },
    },
  ]);

  console.log('✅ Demo data seeded successfully.');
}

export async function connectDatabase() {
  try {
    await mongoose.connect(ENV.MONGODB_URI);
    console.log('✅ Connected to MongoDB database via Mongoose');

    try {
      const productCatalogIndexes = await ProductCatalog.collection.indexes();
      const uniqueProductCodeIndex = productCatalogIndexes.find(
        (index) => index.key.productCode === 1 && index.unique && typeof index.name === 'string'
      );
      if (uniqueProductCodeIndex?.name) {
        await ProductCatalog.collection.dropIndex(uniqueProductCodeIndex.name);
        console.log('🧹 Removed unique ProductCatalog productCode index');
      }
    } catch (error: any) {
      if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound') {
        throw error;
      }
    }

    // Clean up legacy unique index on productCode if it exists
    try {
      await mongoose.connection.collection('orders').dropIndex('productCode_1');
      console.log('🧹 Cleaned up legacy unique index productCode_1 on orders');
    } catch (e) {}

    try {
      const prepIndexes = await mongoose.connection.collection('packagepreparations').indexes();
      const uniquePrepProductCodeIndex = prepIndexes.find(
        (index: any) => index.key?.productCode === 1 && index.unique && typeof index.name === 'string'
      );
      if (uniquePrepProductCodeIndex?.name) {
        await mongoose.connection.collection('packagepreparations').dropIndex(uniquePrepProductCodeIndex.name);
        console.log('🧹 Removed unique PackagePreparation productCode index');
      }
    } catch (e) {}

    // Auto-seed Admin if not exists
    const adminExists = await User.findOne({ email: ENV.ADMIN_DEFAULT_EMAIL });
    if (!adminExists) {
      console.log('🌱 Seeding default Admin user...');
      const adminPasswordHash = await bcrypt.hash(ENV.ADMIN_DEFAULT_PASSWORD, 10);
      await User.create({
        name: 'System Administrator',
        email: ENV.ADMIN_DEFAULT_EMAIL,
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        isActive: true,
      });
      console.log(`✅ Default admin created: ${ENV.ADMIN_DEFAULT_EMAIL}`);
    }

    // Auto-seed Demo Employee if not exists
    const empExists = await User.findOne({ email: 'emp1@example.com' });
    if (!empExists) {
      console.log('🌱 Seeding default Employee user...');
      const empPasswordHash = await bcrypt.hash('Emp@123', 10);
      await User.create({
        name: 'Rohan Sharma',
        email: 'emp1@example.com',
        passwordHash: empPasswordHash,
        role: 'EMPLOYEE',
        isActive: true,
      });
      console.log('✅ Default employee created: emp1@example.com');
    }

    const emp2Exists = await User.findOne({ email: 'emp2@example.com' });
    if (!emp2Exists) {
      const emp2PasswordHash = await bcrypt.hash('Emp@123', 10);
      await User.create({
        name: 'Pooja Verma',
        email: 'emp2@example.com',
        passwordHash: emp2PasswordHash,
        role: 'EMPLOYEE',
        isActive: true,
      });
    }

    await seedDemoDataIfNeeded();
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

export async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error disconnecting from MongoDB:', error);
  }
}
