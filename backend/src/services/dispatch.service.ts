import mongoose from 'mongoose';
import { Order, DispatchLog, VerificationAttempt, User, BookStock } from '../models';
import { normalizeBookCode } from '../utils/normalize';
import { logAudit } from '../utils/audit';
import { computeItemStatus, computeOrderStatus } from './order.service';

export interface VerifyDispatchParams {
  orderItemId?: string;
  orderId?: string;
  enteredCode: string;       // Could be product code OR book code
  employeeId: string;
  requestId?: string;
}

export async function verifyAndDispatchBook(params: {
  orderItemId?: string;
  orderId?: string;
  enteredBookCode: string;
  employeeId: string;
  requestId?: string;
}) {
  const { orderItemId, orderId, enteredBookCode, employeeId, requestId } = params;

  // Check idempotency if requestId provided
  if (requestId) {
    const existingLog = await DispatchLog.findOne({ requestId });
    if (existingLog) {
      const order = await Order.findById(existingLog.orderId);
      const item = order?.items.find((i) =>
        orderItemId ? i._id.toString() === orderItemId : i._id.toString() === existingLog.orderItemId
      );
      if (item && order) {
        const pendingQuantity = Math.max(0, item.requiredQuantity - item.dispatchedQuantity);
        const totalRequired = order.items.reduce((acc, i) => acc + i.requiredQuantity, 0);
        const totalDispatched = order.items.reduce((acc, i) => acc + i.dispatchedQuantity, 0);
        const totalPending = Math.max(0, totalRequired - totalDispatched);
        const orderStatus = computeOrderStatus(order.items);
        return {
          alreadyProcessed: true,
          success: true,
          message: 'This dispatch request was already processed successfully.',
          orderItem: {
            id: item._id.toString(),
            bookCode: item.bookCode,
            bookName: item.bookName,
            requiredQuantity: item.requiredQuantity,
            dispatchedQuantity: item.dispatchedQuantity,
            pendingQuantity,
            status: computeItemStatus(item.requiredQuantity, item.dispatchedQuantity),
          },
          order: {
            id: order._id.toString(),
            studentName: order.studentName,
            trackingId: order.trackingId,
            mobileNumber: order.mobileNumber,
            totalRequired,
            totalDispatched,
            totalPending,
            status: orderStatus,
            items: order.items.map((i) => ({
              id: i._id.toString(),
              bookCode: i.bookCode,
              bookName: i.bookName,
              requiredQuantity: i.requiredQuantity,
              dispatchedQuantity: i.dispatchedQuantity,
              pendingQuantity: Math.max(0, i.requiredQuantity - i.dispatchedQuantity),
              status: computeItemStatus(i.requiredQuantity, i.dispatchedQuantity),
            })),
          },
          orderStatus,
        };
      }
    }
  }

  const normalizedEnteredCode = normalizeBookCode(enteredBookCode);

  // Find order
  let order: any;
  if (orderItemId) {
    order = await Order.findOne({ 'items._id': new mongoose.Types.ObjectId(orderItemId) });
    if (!order) {
      throw { statusCode: 404, message: 'Order item not found', code: 'ITEM_NOT_FOUND' };
    }
  } else if (orderId) {
    order = await Order.findById(orderId);
    if (!order) {
      throw { statusCode: 404, message: 'Order not found', code: 'ORDER_NOT_FOUND' };
    }
  } else {
    // Global Book Scan: Find first active order that has this book code pending
    const candidates = await Order.find({
      'items.bookCode': normalizedEnteredCode,
    }).sort({ createdAt: 1 });

    order = candidates.find((o: any) =>
      o.items.some(
        (i: any) =>
          normalizeBookCode(i.bookCode) === normalizedEnteredCode &&
          i.dispatchedQuantity < i.requiredQuantity
      )
    );

    if (!order) {
      throw {
        statusCode: 404,
        message: `No active order found with pending copies for Book Code "${enteredBookCode}".`,
        code: 'BOOK_NOT_FOUND_OR_DISPATCHED',
      };
    }
  }

  // Match item in order
  let currentItem: any;
  let resolvedItemId: string;

  if (orderItemId) {
    currentItem = order.items.find((i: any) => i._id.toString() === orderItemId);
    if (!currentItem) {
      throw { statusCode: 404, message: 'Order item not found in order', code: 'ITEM_NOT_FOUND' };
    }
    const normalizedExpectedCode = normalizeBookCode(currentItem.bookCode);
    if (normalizedEnteredCode !== normalizedExpectedCode) {
      const mismatchWarning = 'Warning: Book code does not match this order. Please verify the book.';
      await VerificationAttempt.create({
        orderId: order._id,
        orderItemId,
        employeeId: new mongoose.Types.ObjectId(employeeId),
        enteredBookCode: enteredBookCode.trim(),
        success: false,
        failureReason: mismatchWarning,
      });
      throw {
        statusCode: 400,
        message: mismatchWarning,
        code: 'BOOK_CODE_MISMATCH',
        expectedCode: currentItem.bookCode,
        enteredCode: enteredBookCode,
      };
    }
    resolvedItemId = orderItemId;
  } else {
    // Look up item in order.items matching the code
    const matchingItems = order.items.filter(
      (i: any) => normalizeBookCode(i.bookCode) === normalizedEnteredCode
    );

    if (matchingItems.length === 0) {
      const mismatchWarning = 'Warning: Book code does not match this order. Please verify the book.';
      await VerificationAttempt.create({
        orderId: order._id,
        employeeId: new mongoose.Types.ObjectId(employeeId),
        enteredBookCode: enteredBookCode.trim(),
        success: false,
        failureReason: mismatchWarning,
      });
      throw {
        statusCode: 400,
        message: mismatchWarning,
        code: 'BOOK_CODE_MISMATCH',
        enteredCode: enteredBookCode,
      };
    }

    // Find the item with pending copies
    currentItem = matchingItems.find((i: any) => i.requiredQuantity > i.dispatchedQuantity);
    if (!currentItem) {
      // All copies of this book are already dispatched!
      throw {
        statusCode: 400,
        message: `All copies of book code "${enteredBookCode}" have already been dispatched for this student.`,
        code: 'NO_PENDING_QUANTITY',
        enteredCode: enteredBookCode,
      };
    }
    resolvedItemId = currentItem._id.toString();
  }

  // Check pending quantity
  const pendingQuantity = currentItem.requiredQuantity - currentItem.dispatchedQuantity;
  if (pendingQuantity <= 0) {
    throw {
      statusCode: 400,
      message: 'All copies for this book item have already been dispatched. No copies remaining.',
      code: 'NO_PENDING_QUANTITY',
    };
  }

  // Check available stock in warehouse BookStock master
  const cleanBookCode = normalizeBookCode(currentItem.bookCode);
  const bookStock = await BookStock.findOne({ bookCode: cleanBookCode });
  const stockBeforeDispatch = bookStock?.availableQuantity ?? 0;
  const stockWarning =
    stockBeforeDispatch < 1
      ? `Warning: "${currentItem.bookName} (${currentItem.bookCode})" was not available in system stock. Physical dispatch was recorded and stock is now ${stockBeforeDispatch - 1}. Add inward stock to reconcile this balance.`
      : undefined;

  // Atomically increment dispatchedQuantity ensuring it doesn't exceed requiredQuantity
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      items: {
        $elemMatch: {
          _id: new mongoose.Types.ObjectId(resolvedItemId),
          dispatchedQuantity: { $lt: currentItem.requiredQuantity },
        },
      },
    },
    {
      $inc: { 'items.$.dispatchedQuantity': 1 },
    },
    { returnDocument: 'after' }
  );

  if (!updatedOrder) {
    throw {
      statusCode: 400,
      message: 'Dispatch rejected: Copies have already been fully dispatched.',
      code: 'NO_PENDING_QUANTITY',
    };
  }

  const updatedItem = updatedOrder.items.find((i: any) => i._id.toString() === resolvedItemId)!;

  // Record physical dispatch even when stock is missing or already depleted.
  await BookStock.findOneAndUpdate(
    { bookCode: cleanBookCode },
    {
      $setOnInsert: {
        bookCode: cleanBookCode,
        bookName: currentItem.bookName,
        totalInward: 0,
        lowStockThreshold: 10,
        lastRestockedAt: new Date(),
      },
      $inc: { availableQuantity: -1, totalDispatched: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: false }
  );

  // Create immutable dispatch log
  const dispatchLog = await DispatchLog.create({
    orderId: order._id,
    orderItemId: resolvedItemId,
    employeeId: new mongoose.Types.ObjectId(employeeId),
    verifiedBookCode: normalizeBookCode(updatedItem.bookCode),
    quantity: 1,
    requestId: requestId || undefined,
    result: 'SUCCESS',
  });

  // Record successful verification attempt
  await VerificationAttempt.create({
    orderId: order._id,
    orderItemId: resolvedItemId,
    employeeId: new mongoose.Types.ObjectId(employeeId),
    enteredBookCode: normalizedEnteredCode,
    success: true,
  });

  // Log Audit
  await logAudit({
    actorUserId: employeeId,
    action: 'BOOK_DISPATCHED',
    entityType: 'OrderItem',
    entityId: resolvedItemId,
    metadata: {
      bookCode: currentItem.bookCode,
      bookName: currentItem.bookName,
      orderId: order._id.toString(),
      newDispatchedQuantity: updatedItem.dispatchedQuantity,
      requiredQuantity: updatedItem.requiredQuantity,
    },
  });

  const totalRequired = updatedOrder.items.reduce((acc: number, i: any) => acc + i.requiredQuantity, 0);
  const totalDispatched = updatedOrder.items.reduce((acc: number, i: any) => acc + i.dispatchedQuantity, 0);
  const totalPending = Math.max(0, totalRequired - totalDispatched);
  const orderStatus = computeOrderStatus(updatedOrder.items);
  const newPending = Math.max(0, updatedItem.requiredQuantity - updatedItem.dispatchedQuantity);

  const itemsWithStatus = updatedOrder.items.map((i: any) => ({
    id: i._id.toString(),
    bookCode: i.bookCode,
    bookName: i.bookName,
    requiredQuantity: i.requiredQuantity,
    dispatchedQuantity: i.dispatchedQuantity,
    pendingQuantity: Math.max(0, i.requiredQuantity - i.dispatchedQuantity),
    status: computeItemStatus(i.requiredQuantity, i.dispatchedQuantity),
  }));

  const copyInfo =
    updatedItem.requiredQuantity > 1
      ? ` (Copy ${updatedItem.dispatchedQuantity} of ${updatedItem.requiredQuantity})`
      : '';

  return {
    success: true,
    message: [
      `Book code "${updatedItem.bookCode}" verified! 1 copy dispatched successfully.${copyInfo}`,
      stockWarning,
    ]
      .filter(Boolean)
      .join(' '),
    stockWarning,
    orderItem: {
      id: updatedItem._id.toString(),
      bookCode: updatedItem.bookCode,
      bookName: updatedItem.bookName,
      requiredQuantity: updatedItem.requiredQuantity,
      dispatchedQuantity: updatedItem.dispatchedQuantity,
      pendingQuantity: newPending,
      status: computeItemStatus(updatedItem.requiredQuantity, updatedItem.dispatchedQuantity),
    },
    order: {
      id: updatedOrder._id.toString(),
      orderCode: updatedOrder.orderCode,
      productCode: updatedOrder.productCode,
      studentName: updatedOrder.studentName,
      trackingId: updatedOrder.trackingId,
      mobileNumber: updatedOrder.mobileNumber,
      email: updatedOrder.email,
      totalRequired,
      totalDispatched,
      totalPending,
      status: orderStatus,
      items: itemsWithStatus,
    },
    orderStatus,
    dispatchLogId: dispatchLog._id.toString(),
  };
}

// ─── Dispatch by Order Unique Code ──────────────────────────────────────────
// When employee scans an Order Unique Code (ORD-YYMM-NNNNN), all pending books
// in that order are displayed and dispatched atomically.
export async function dispatchByOrderCode(params: {
  orderCode: string;
  employeeId: string;
  requestId?: string;
}) {
  const { orderCode, employeeId, requestId } = params;
  const normalizedOrderCode = orderCode.trim().toUpperCase();

  const order = await Order.findOne({
    $or: [
      { orderCode: normalizedOrderCode },
      { trackingId: normalizedOrderCode },
      { orderCode: new RegExp(`^${normalizedOrderCode}$`, 'i') },
      { trackingId: new RegExp(`^${normalizedOrderCode}$`, 'i') }
    ]
  });
  if (!order) {
    throw {
      statusCode: 404,
      message: `No order found with Order Barcode / Tracking ID "${normalizedOrderCode}". Please verify the barcode.`,
      code: 'ORDER_CODE_NOT_FOUND',
    };
  }

  // Find all pending items in this order
  const pendingItems = order.items.filter((i: any) => i.dispatchedQuantity < i.requiredQuantity);
  const totalRequired = order.items.reduce((acc: number, i: any) => acc + i.requiredQuantity, 0);
  const totalDispatched = order.items.reduce((acc: number, i: any) => acc + i.dispatchedQuantity, 0);

  if (pendingItems.length === 0) {
    return {
      success: true,
      alreadyProcessed: true,
      scanType: 'ORDER_CODE',
      orderCode: normalizedOrderCode,
      message: `Order "${normalizedOrderCode}" is already fully dispatched!`,
      order: {
        id: order._id.toString(),
        orderCode: order.orderCode,
        productCode: order.productCode,
        studentName: order.studentName,
        trackingId: order.trackingId,
        mobileNumber: order.mobileNumber,
        totalRequired,
        totalDispatched,
        totalPending: 0,
        status: 'COMPLETED',
        items: order.items.map((i: any) => ({
          id: i._id.toString(),
          productCode: i.productCode,
          productName: i.productName,
          bookCode: i.bookCode,
          bookName: i.bookName,
          requiredQuantity: i.requiredQuantity,
          dispatchedQuantity: i.dispatchedQuantity,
          pendingQuantity: 0,
          status: 'COMPLETED',
        })),
      },
      itemsDispatched: 0,
    };
  }

  // Verify that all pending items have sufficient available stock in warehouse
  for (const item of pendingItems) {
    const remaining = item.requiredQuantity - item.dispatchedQuantity;
    const cleanCode = normalizeBookCode(item.bookCode);
    const stock = await BookStock.findOne({ bookCode: cleanCode });
    if (!stock || stock.availableQuantity < remaining) {
      throw {
        statusCode: 400,
        message: `❌ Out of Stock: Book "${item.bookName} (${item.bookCode})" needs ${remaining} copies, but warehouse only has ${stock ? stock.availableQuantity : 0} available! Kripya "Stock Inward" page me stock enter karein.`,
        code: 'OUT_OF_STOCK',
        bookCode: item.bookCode,
      };
    }
  }

  // Atomically dispatch all pending items in this order and deduct warehouse stock
  for (const item of pendingItems) {
    const remaining = item.requiredQuantity - item.dispatchedQuantity;
    const cleanCode = normalizeBookCode(item.bookCode);

    await Order.updateOne(
      { _id: order._id, 'items._id': item._id },
      { $set: { 'items.$.dispatchedQuantity': item.requiredQuantity } }
    );

    await BookStock.findOneAndUpdate(
      { bookCode: cleanCode },
      {
        $inc: {
          availableQuantity: -remaining,
          totalDispatched: remaining,
        },
      }
    );

    await DispatchLog.create({
      orderId: order._id,
      orderItemId: item._id.toString(),
      employeeId: new mongoose.Types.ObjectId(employeeId),
      verifiedBookCode: item.bookCode,
      quantity: remaining,
      requestId: requestId ? `${requestId}-${item._id}` : undefined,
      result: 'SUCCESS',
      dispatchMode: 'ORDER_CODE_SCAN',
    });

    await VerificationAttempt.create({
      orderId: order._id,
      orderItemId: item._id.toString(),
      employeeId: new mongoose.Types.ObjectId(employeeId),
      enteredBookCode: normalizedOrderCode,
      success: true,
    });
  }

  const updatedOrder = await Order.findById(order._id);
  const newTotalRequired = updatedOrder!.items.reduce((acc: number, i: any) => acc + i.requiredQuantity, 0);
  const newTotalDispatched = updatedOrder!.items.reduce((acc: number, i: any) => acc + i.dispatchedQuantity, 0);

  await logAudit({
    actorUserId: employeeId,
    action: 'ORDER_DISPATCHED_BY_ORDER_CODE',
    entityType: 'Order',
    entityId: order._id.toString(),
    metadata: {
      orderCode: normalizedOrderCode,
      student: order.studentName,
      itemsDispatched: pendingItems.length,
    },
  });

  return {
    success: true,
    scanType: 'ORDER_CODE',
    orderCode: normalizedOrderCode,
    message: `Order "${normalizedOrderCode}" verified! All ${pendingItems.length} book(s) dispatched for ${order.studentName}.`,
    order: {
      id: order._id.toString(),
      orderCode: order.orderCode,
      productCode: order.productCode,
      studentName: order.studentName,
      trackingId: order.trackingId,
      mobileNumber: order.mobileNumber,
      totalRequired: newTotalRequired,
      totalDispatched: newTotalDispatched,
      totalPending: Math.max(0, newTotalRequired - newTotalDispatched),
      status: 'COMPLETED',
      items: updatedOrder!.items.map((i: any) => ({
        id: i._id.toString(),
        productCode: i.productCode,
        productName: i.productName,
        bookCode: i.bookCode,
        bookName: i.bookName,
        requiredQuantity: i.requiredQuantity,
        dispatchedQuantity: i.dispatchedQuantity,
        pendingQuantity: 0,
        status: 'COMPLETED',
      })),
    },
    itemsDispatched: pendingItems.length,
  };
}

// ─── Dispatch by Product Code ────────────────────────────────────────────────
// When employee scans a Product Code, all pending book items under that product
// in the matching order are dispatched atomically.
export async function dispatchByProductCode(params: {
  productCode: string;
  orderId?: string;
  employeeId: string;
  requestId?: string;
}) {
  const { productCode, orderId, employeeId, requestId } = params;
  const normalizedProductCode = productCode.trim().toUpperCase();

  // Find order
  let order: any;
  if (orderId) {
    order = await Order.findById(orderId);
  } else {
    const candidates = await Order.find({
      $or: [
        { productCode: normalizedProductCode },
        { 'items.productCode': normalizedProductCode },
      ],
    });
    order = candidates.find((o: any) => o.items.some((i: any) => i.dispatchedQuantity < i.requiredQuantity));
  }

  if (!order) {
    throw {
      statusCode: 404,
      message: `No active order found with pending books for Product Code "${normalizedProductCode}".`,
      code: 'PRODUCT_CODE_NOT_FOUND',
    };
  }

  const isMatchingOrderLevel = order.productCode && order.productCode.toUpperCase() === normalizedProductCode;
  const matchingItems = order.items.filter((i: any) =>
    (isMatchingOrderLevel || (i.productCode && i.productCode.toUpperCase() === normalizedProductCode)) &&
    i.dispatchedQuantity < i.requiredQuantity
  );

  if (matchingItems.length === 0) {
    throw {
      statusCode: 400,
      message: `All books for Product Code "${normalizedProductCode}" in order for ${order.studentName} have already been dispatched.`,
      code: 'PRODUCT_FULLY_DISPATCHED',
    };
  }

  const stockWarnings: string[] = [];

  // Physical dispatch is recorded even if the stock ledger is missing or short.
  for (const item of matchingItems) {
    const remaining = item.requiredQuantity - item.dispatchedQuantity;
    const cleanCode = normalizeBookCode(item.bookCode);
    const stock = await BookStock.findOne({ bookCode: cleanCode });
    const availableQuantity = stock?.availableQuantity ?? 0;
    if (availableQuantity < remaining) {
      stockWarnings.push(
        `Warning: "${item.bookName} (${item.bookCode})" needs ${remaining} copies; system stock was ${availableQuantity}. Physical dispatch was recorded and stock balance will be negative until inward stock is added.`
      );
    }
  }

  // Dispatch all matching items and deduct warehouse stock
  for (const item of matchingItems) {
    const remaining = item.requiredQuantity - item.dispatchedQuantity;
    const cleanCode = normalizeBookCode(item.bookCode);

    await Order.updateOne(
      { _id: order._id, 'items._id': item._id },
      { $set: { 'items.$.dispatchedQuantity': item.requiredQuantity } }
    );

    await BookStock.findOneAndUpdate(
      { bookCode: cleanCode },
      {
        $setOnInsert: {
          bookCode: cleanCode,
          totalInward: 0,
          lowStockThreshold: 10,
          lastRestockedAt: new Date(),
        },
        $set: {
          bookName: item.bookName,
        },
        $inc: {
          availableQuantity: -remaining,
          totalDispatched: remaining,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await DispatchLog.create({
      orderId: order._id,
      orderItemId: item._id.toString(),
      employeeId: new mongoose.Types.ObjectId(employeeId),
      verifiedBookCode: item.bookCode,
      quantity: remaining,
      requestId: requestId ? `${requestId}-${item._id}` : undefined,
      result: 'SUCCESS',
      dispatchMode: 'PRODUCT_SCAN',
    });

    await VerificationAttempt.create({
      orderId: order._id,
      orderItemId: item._id.toString(),
      employeeId: new mongoose.Types.ObjectId(employeeId),
      enteredBookCode: normalizedProductCode,
      success: true,
    });
  }

  const updatedOrder = await Order.findById(order._id);
  const totalRequired = updatedOrder!.items.reduce((acc: number, i: any) => acc + i.requiredQuantity, 0);
  const totalDispatched = updatedOrder!.items.reduce((acc: number, i: any) => acc + i.dispatchedQuantity, 0);
  const totalPending = Math.max(0, totalRequired - totalDispatched);
  const orderStatus = computeOrderStatus(updatedOrder!.items);

  await logAudit({
    actorUserId: employeeId,
    action: 'ORDER_DISPATCHED_BY_PRODUCT_CODE',
    entityType: 'Order',
    entityId: order._id.toString(),
    metadata: {
      productCode: normalizedProductCode,
      student: order.studentName,
      itemsDispatched: matchingItems.length,
      stockWarnings,
    },
  });

  const stockWarning = stockWarnings.length > 0 ? stockWarnings.join(' ') : undefined;

  return {
    success: true,
    scanType: 'PRODUCT_CODE',
    productCode: normalizedProductCode,
    message: [
      `Product Code "${normalizedProductCode}" verified! ${matchingItems.length} book(s) dispatched for ${order.studentName}.`,
      stockWarning,
    ]
      .filter(Boolean)
      .join(' '),
    stockWarning,
    order: {
      id: order._id.toString(),
      orderCode: order.orderCode,
      productCode: order.productCode,
      studentName: order.studentName,
      trackingId: order.trackingId,
      mobileNumber: order.mobileNumber,
      totalRequired,
      totalDispatched,
      totalPending,
      status: orderStatus,
      items: updatedOrder!.items.map((i: any) => ({
        id: i._id.toString(),
        productCode: i.productCode,
        productName: i.productName,
        bookCode: i.bookCode,
        bookName: i.bookName,
        requiredQuantity: i.requiredQuantity,
        dispatchedQuantity: i.dispatchedQuantity,
        pendingQuantity: Math.max(0, i.requiredQuantity - i.dispatchedQuantity),
        status: computeItemStatus(i.requiredQuantity, i.dispatchedQuantity),
      })),
    },
    itemsDispatched: matchingItems.length,
  };
}

export async function getDispatchHistory(params: {
  employeeId?: string;
  bookCode?: string;
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 10));
  const skip = (page - 1) * limit;

  const { startDate, endDate } = require('../utils/date').parseDateFilter(
    params.dateFilter,
    params.startDate,
    params.endDate
  );

  const query: any = { result: 'SUCCESS' };

  if (params.employeeId) {
    query.employeeId = new mongoose.Types.ObjectId(params.employeeId);
  }

  if (startDate && endDate) {
    query.dispatchedAt = { $gte: startDate, $lte: endDate };
  }

  if (params.bookCode) {
    query.verifiedBookCode = params.bookCode.toUpperCase();
  }

  const [logs, total] = await Promise.all([
    DispatchLog.find(query)
      .populate('employeeId', 'name email')
      .populate('orderId', 'studentName trackingId mobileNumber items')
      .sort({ dispatchedAt: -1 })
      .skip(skip)
      .limit(limit),
    DispatchLog.countDocuments(query),
  ]);

  const mapped = logs.map((log: any) => {
    const item = log.orderId?.items?.find((i: any) => i._id.toString() === log.orderItemId);
    return {
      id: log._id.toString(),
      orderItemId: log.orderItemId,
      employeeId: log.employeeId?._id?.toString(),
      employee: log.employeeId,
      verifiedBookCode: log.verifiedBookCode,
      quantity: log.quantity,
      dispatchedAt: log.dispatchedAt,
      result: log.result,
      orderItem: {
        id: log.orderItemId,
        bookCode: log.verifiedBookCode,
        bookName: item?.bookName || 'Book',
        order: {
          id: log.orderId?._id?.toString(),
          studentName: log.orderId?.studentName,
          trackingId: log.orderId?.trackingId,
          mobileNumber: log.orderId?.mobileNumber,
        },
      },
    };
  });

  return {
    logs: mapped,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getFailedAttempts(params: {
  employeeId?: string;
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 10));
  const skip = (page - 1) * limit;

  const { startDate, endDate } = require('../utils/date').parseDateFilter(
    params.dateFilter,
    params.startDate,
    params.endDate
  );

  const query: any = { success: false };

  if (params.employeeId) {
    query.employeeId = new mongoose.Types.ObjectId(params.employeeId);
  }

  if (startDate && endDate) {
    query.attemptedAt = { $gte: startDate, $lte: endDate };
  }

  const [attempts, total] = await Promise.all([
    VerificationAttempt.find(query)
      .populate('employeeId', 'name email')
      .populate('orderId', 'studentName trackingId items')
      .sort({ attemptedAt: -1 })
      .skip(skip)
      .limit(limit),
    VerificationAttempt.countDocuments(query),
  ]);

  const mapped = attempts.map((att: any) => {
    const item = att.orderId?.items?.find((i: any) => i._id.toString() === att.orderItemId);
    return {
      id: att._id.toString(),
      orderItemId: att.orderItemId,
      employeeId: att.employeeId?._id?.toString(),
      employee: att.employeeId,
      enteredBookCode: att.enteredBookCode,
      success: att.success,
      failureReason: att.failureReason,
      attemptedAt: att.attemptedAt,
      orderItem: {
        id: att.orderItemId,
        bookCode: item?.bookCode || '-',
        bookName: item?.bookName || '-',
        order: {
          id: att.orderId?._id?.toString(),
          studentName: att.orderId?.studentName,
          trackingId: att.orderId?.trackingId,
        },
      },
    };
  });

  return {
    attempts: mapped,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/* =========================================================================
   DATE-WISE STOCK DISPATCH HISTORY
   For each book: opening stock → dispatched on date → closing stock
========================================================================= */
export async function getStockDispatchHistory(params: {
  date?: string;       // YYYY-MM-DD, defaults to today
  bookCode?: string;   // optional filter by specific book code
}) {
  const { date, bookCode } = params;

  // Build date range (full day in IST)
  const targetDate = date ? new Date(date) : new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  // Build book filter
  const bookFilter: any = {};
  if (bookCode) {
    bookFilter.verifiedBookCode = { $regex: new RegExp(bookCode.trim(), 'i') };
  }

  // 1. Get all dispatch logs for that date
  const dispatches = await DispatchLog.find({
    dispatchedAt: { $gte: dayStart, $lte: dayEnd },
    result: 'SUCCESS',
    ...bookFilter,
  })
    .populate('orderId', 'studentName trackingId orderCode productCode mobileNumber')
    .populate('employeeId', 'name email')
    .sort({ dispatchedAt: 1 })
    .lean();

  // 2. Group by book code
  const bookMap = new Map<string, {
    bookCode: string;
    bookName: string;
    productCode: string;
    totalDispatchedToday: number;
    currentAvailable: number;
    totalInward: number;
    totalDispatched: number;
    dispatches: any[];
  }>();

  // Get unique book codes dispatched today
  const uniqueBookCodes = Array.from(new Set(dispatches.map((d: any) => d.verifiedBookCode)));

  // Fetch book stock info for all unique codes
  const bookStocks = await BookStock.find({
    bookCode: { $in: uniqueBookCodes },
  }).lean();
  const bookStockMap = new Map(bookStocks.map((b: any) => [b.bookCode, b]));

  // Group dispatches per book
  for (const d of dispatches as any[]) {
    const bCode = d.verifiedBookCode;
    if (!bookMap.has(bCode)) {
      const bs = bookStockMap.get(bCode) as any;
      bookMap.set(bCode, {
        bookCode: bCode,
        bookName: bs?.bookName || bCode,
        productCode: bs?.productCode || '',
        totalDispatchedToday: 0,
        currentAvailable: bs?.availableQuantity ?? 0,
        totalInward: bs?.totalInward ?? 0,
        totalDispatched: bs?.totalDispatched ?? 0,
        dispatches: [],
      });
    }
    const entry = bookMap.get(bCode)!;
    entry.totalDispatchedToday += d.quantity || 1;
    entry.dispatches.push({
      id: d._id?.toString(),
      dispatchedAt: d.dispatchedAt,
      studentName: (d.orderId as any)?.studentName || 'Unknown',
      trackingId: (d.orderId as any)?.trackingId || '',
      orderCode: (d.orderId as any)?.orderCode || '',
      mobileNumber: (d.orderId as any)?.mobileNumber || '',
      employeeName: (d.employeeId as any)?.name || 'Admin',
      quantity: d.quantity || 1,
    });
  }

  // 3. Build result rows — compute opening stock = currentAvailable + totalDispatchedToday
  const rows = Array.from(bookMap.values()).map((b) => {
    const openingStock = b.currentAvailable + b.totalDispatchedToday;
    return {
      bookCode: b.bookCode,
      bookName: b.bookName,
      productCode: b.productCode,
      openingStock,                         // Stock at start of day (before today's dispatches)
      totalDispatchedToday: b.totalDispatchedToday,
      closingStock: b.currentAvailable,     // Current live stock (after today's dispatches)
      totalInward: b.totalInward,
      totalDispatchedAllTime: b.totalDispatched,
      dispatches: b.dispatches,
    };
  });

  // Sort by most dispatched today
  rows.sort((a, b) => b.totalDispatchedToday - a.totalDispatchedToday);

  return {
    date: dayStart.toISOString().slice(0, 10),
    dateLabel: dayStart.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
    totalBooksDispatched: rows.reduce((acc, r) => acc + r.totalDispatchedToday, 0),
    totalOrdersProcessed: new Set(dispatches.map((d: any) => d.orderId?.toString())).size,
    uniqueBookTitles: rows.length,
    rows,
  };
}
