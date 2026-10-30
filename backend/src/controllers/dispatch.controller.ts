import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { verifyDispatchSchema } from '../validators/dispatch.validator';
import * as dispatchService from '../services/dispatch.service';
import { Order } from '../models';
import { successResponse, errorResponse } from '../utils/response';
import * as orderService from '../services/order.service';
import { computeOrderStatus, computeItemStatus } from '../services/order.service';
import { normalizeBookCode } from '../utils/normalize';
import { logAudit } from '../utils/audit';

async function notifyOrderWhenFullyDispatched(orderId: string, actorUserId: string, totalPending: number) {
  if (!orderId || totalPending > 0) {
    return null;
  }

  return orderService.markOrderEmailSent(orderId, actorUserId);
}

export async function verifyAndDispatch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return errorResponse(res, 'Unauthorized', 'UNAUTHORIZED', 401);
    }

    const { orderItemId, orderId, enteredBookCode, enteredCode, requestId, action } = req.body;
    const scannedCode = (enteredCode || enteredBookCode || '').trim().toUpperCase();

    // 0. Manual action: Finish partial order or quick dispatch all
    if (action === 'MANUAL_FINISH_ORDER' && orderId) {
      const order = await Order.findById(orderId);
      if (!order) {
        return errorResponse(res, 'Order not found', 'ORDER_NOT_FOUND', 404);
      }
      const totalRequired = order.items.reduce((acc: number, i: any) => acc + i.requiredQuantity, 0);
      const totalDispatched = order.items.reduce((acc: number, i: any) => acc + i.dispatchedQuantity, 0);
      const totalPending = Math.max(0, totalRequired - totalDispatched);
      const orderStatus = computeOrderStatus(order.items);

      await logAudit({
        actorUserId: req.user.id,
        action: 'ORDER_MANUALLY_DISPATCHED',
        entityType: 'Order',
        entityId: order._id.toString(),
        metadata: { student: order.studentName, totalDispatched, totalPending },
      });

      return successResponse(res, `Order for ${order.studentName} updated. Dispatched: ${totalDispatched}/${totalRequired}. Remaining: ${totalPending} (marked Pending).`, {
        order: {
          id: order._id.toString(),
          orderCode: order.orderCode,
          productCode: order.productCode,
          studentName: order.studentName,
          trackingId: order.trackingId,
          totalRequired,
          totalDispatched,
          totalPending,
          status: orderStatus,
          items: order.items.map((i: any) => ({
            id: i._id.toString(),
            productCode: i.productCode || order.productCode,
            productName: i.productName || 'Product',
            bookCode: i.bookCode,
            bookName: i.bookName,
            requiredQuantity: i.requiredQuantity,
            dispatchedQuantity: i.dispatchedQuantity,
            pendingQuantity: Math.max(0, i.requiredQuantity - i.dispatchedQuantity),
            status: computeItemStatus(i.requiredQuantity, i.dispatchedQuantity),
          })),
        },
        action: 'ORDER_FINISHED',
      });
    }

    if (action === 'QUICK_DISPATCH_ALL' && orderId) {
      const order = await Order.findById(orderId);
      if (!order) {
        return errorResponse(res, 'Order not found', 'ORDER_NOT_FOUND', 404);
      }
      const result = await dispatchService.dispatchByOrderCode({
        orderCode: order.orderCode,
        employeeId: req.user.id,
        requestId,
      });

      const notification = await notifyOrderWhenFullyDispatched(
        result.order?.id || order._id.toString(),
        req.user.id,
        result.order?.totalPending ?? 0
      );

      return successResponse(res, result.message, {
        ...result,
        notification,
      });
    }

    if (!scannedCode) {
      return errorResponse(res, 'No code entered. Please scan or type a code.', 'CODE_REQUIRED', 400);
    }

    if (scannedCode.length < 4 || scannedCode === 'ORD-' || scannedCode === 'PRD-' || scannedCode === 'BK-' || scannedCode === 'UNQ-') {
      return errorResponse(res, `Incomplete code "${scannedCode}". Please scan or enter the complete barcode.`, 'INCOMPLETE_CODE', 400);
    }

    // Check if there is an active order loaded on screen and whether scannedCode belongs to it as a book or product
    const activeOrderForContext = orderId ? await Order.findById(orderId) : null;
    const isBookOrProductOfActiveOrder = activeOrderForContext ? (
      (activeOrderForContext.productCode && activeOrderForContext.productCode.toUpperCase() === scannedCode) ||
      activeOrderForContext.items.some((i: any) => 
        (i.productCode && i.productCode.toUpperCase() === scannedCode) ||
        normalizeBookCode(i.bookCode) === normalizeBookCode(scannedCode)
      )
    ) : false;

    // 1. Order Barcode Scan (Order Code or Tracking ID, e.g. 151026001, ORD-2410-00001, UNQ-..., DTDC...)
    // If it's not a book/product of the currently active order, check if it matches an orderCode or trackingId
    const isExplicitOrderPrefix = (scannedCode.startsWith('ORD-') || scannedCode.startsWith('UNQ-')) && scannedCode.length >= 10;
    const matchedByOrderCode = !isBookOrProductOfActiveOrder ? await Order.findOne({
      $or: [
        { orderCode: scannedCode },
        { trackingId: scannedCode },
        { orderCode: new RegExp(`^${scannedCode}$`, 'i') },
        { trackingId: new RegExp(`^${scannedCode}$`, 'i') }
      ]
    }) : null;

    if (matchedByOrderCode || isExplicitOrderPrefix) {
      if (!matchedByOrderCode) {
        return errorResponse(res, `No order found with Order Unique Code "${scannedCode}". Please verify barcode.`, 'ORDER_NOT_FOUND', 404);
      }

      const totalRequired = matchedByOrderCode.items.reduce((acc: number, i: any) => acc + i.requiredQuantity, 0);
      const totalDispatched = matchedByOrderCode.items.reduce((acc: number, i: any) => acc + i.dispatchedQuantity, 0);
      const totalPending = Math.max(0, totalRequired - totalDispatched);

      // Duplicate scan prevention: If order is already completed, throw error!
      if (totalPending === 0) {
        return errorResponse(
          res,
          `❌ Order "${scannedCode}" has ALREADY been fully dispatched! Cannot scan again.`,
          'ORDER_ALREADY_COMPLETED',
          400
        );
      }

      // Order is active: Load details for physical verification
      return successResponse(res, `Order "${scannedCode}" loaded for ${matchedByOrderCode.studentName}. Scan Product Code or Book Barcodes to verify.`, {
        scanType: 'ORDER_LOADED',
        order: {
          id: matchedByOrderCode._id.toString(),
          orderCode: matchedByOrderCode.orderCode,
          productCode: matchedByOrderCode.productCode,
          studentName: matchedByOrderCode.studentName,
          mobileNumber: matchedByOrderCode.mobileNumber,
          trackingId: matchedByOrderCode.trackingId,
          totalRequired,
          totalDispatched,
          totalPending,
          status: computeOrderStatus(matchedByOrderCode.items),
          items: matchedByOrderCode.items.map((i: any) => ({
            id: i._id.toString(),
            productCode: i.productCode || matchedByOrderCode.productCode,
            productName: i.productName || 'Product',
            bookCode: i.bookCode,
            bookName: i.bookName,
            requiredQuantity: i.requiredQuantity,
            dispatchedQuantity: i.dispatchedQuantity,
            pendingQuantity: Math.max(0, i.requiredQuantity - i.dispatchedQuantity),
            status: computeItemStatus(i.requiredQuantity, i.dispatchedQuantity),
          })),
        },
      });
    }

    // 2. Active Order Context (Order is currently loaded on screen)
    if (orderId) {
      const activeOrder = activeOrderForContext || await Order.findById(orderId);
      if (activeOrder) {
        const orderRemaining = activeOrder.items.reduce(
          (acc: number, i: any) => acc + Math.max(0, i.requiredQuantity - i.dispatchedQuantity),
          0
        );
        if (orderRemaining === 0) {
          return errorResponse(res, `Order "${activeOrder.orderCode}" is already fully dispatched!`, 'ORDER_ALREADY_COMPLETED', 400);
        }

        // A. Check if scannedCode matches this active order's product code
        const isMatchingProduct =
          (activeOrder.productCode && activeOrder.productCode.toUpperCase() === scannedCode) ||
          activeOrder.items.some((i: any) => i.productCode && i.productCode.toUpperCase() === scannedCode);

        if (isMatchingProduct) {
          const result = await dispatchService.dispatchByProductCode({
            productCode: scannedCode,
            orderId: activeOrder._id.toString(),
            employeeId: req.user.id,
            requestId,
          });
          const notification = await notifyOrderWhenFullyDispatched(
            result.order?.id || activeOrder._id.toString(),
            req.user.id,
            result.order?.totalPending ?? 0
          );
          const isFullyDone = (result.order?.totalPending ?? 0) === 0;
          const msg = isFullyDone
            ? `Product Code "${scannedCode}" Scanned & Verified! All products & books verified & dispatched for ${activeOrder.studentName}. Order Complete!`
            : `Product Code "${scannedCode}" Scanned & Verified (${result.itemsDispatched || 1} book(s) dispatched). ${result.order?.totalPending} item(s) still pending for ${activeOrder.studentName}. Please scan remaining product code(s).`;

          return successResponse(
            res,
            msg,
            { ...result, message: msg, notification }
          );
        }

        // B. Check if scannedCode matches any book in this active order
        const matchingItem = activeOrder.items.find(
          (i: any) => normalizeBookCode(i.bookCode) === normalizeBookCode(scannedCode)
        );

        if (matchingItem) {
          if (matchingItem.dispatchedQuantity >= matchingItem.requiredQuantity) {
            return errorResponse(
              res,
              `❌ Book "${matchingItem.bookName || scannedCode}" is already verified for this order! Double scan prevented.`,
              'ALREADY_VERIFIED',
              400
            );
          }

          const result = await dispatchService.verifyAndDispatchBook({
            orderItemId: matchingItem._id.toString(),
            orderId: activeOrder._id.toString(),
            enteredBookCode: scannedCode,
            employeeId: req.user.id,
            requestId,
          });
          const notification = await notifyOrderWhenFullyDispatched(
            result.order?.id || activeOrder._id.toString(),
            req.user.id,
            result.order?.totalPending ?? 0
          );
          return successResponse(
            res,
            `Book Code "${scannedCode}" Scanned & Verified! 1 copy verified for ${activeOrder.studentName}.`,
            { ...result, scanType: 'BOOK_CODE', verifiedBookCode: scannedCode, notification }
          );
        }

        // C. Scanned code does NOT belong to active order!
        return errorResponse(
          res,
          `Warning: Book code does not match this order. Please verify the book.`,
          'BOOK_CODE_MISMATCH',
          400
        );
      }
    }

    // 3. Fallback when no order is loaded on screen:
    // Try matching product code across active orders
    const matchedByProduct = await Order.findOne({
      $or: [{ productCode: scannedCode }, { 'items.productCode': scannedCode }],
    });

    if (matchedByProduct) {
      const result = await dispatchService.dispatchByProductCode({
        productCode: scannedCode,
        orderId,
        employeeId: req.user.id,
        requestId,
      });
      const notification = await notifyOrderWhenFullyDispatched(
        result.order?.id || matchedByProduct._id.toString(),
        req.user.id,
        result.order?.totalPending ?? 0
      );
      return successResponse(res, result.message, { ...result, notification });
    }

    // Try matching book code across active orders
    const result = await dispatchService.verifyAndDispatchBook({
      orderItemId,
      orderId,
      enteredBookCode: scannedCode,
      employeeId: req.user.id,
      requestId,
    });
    const notification = await notifyOrderWhenFullyDispatched(
      result.order?.id || orderId || result.orderItem?.id,
      req.user.id,
      result.order?.totalPending ?? 0
    );

    return successResponse(res, result.message, { ...result, scanType: 'BOOK_CODE', notification });
  } catch (error) {
    next(error);
  }
}

export async function getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { employeeId, bookCode, dateFilter, startDate, endDate, page, limit } = req.query;

    const result = await dispatchService.getDispatchHistory({
      employeeId: employeeId as string,
      bookCode: bookCode as string,
      dateFilter: dateFilter as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 10,
    });

    return successResponse(res, 'Dispatch history retrieved', result);
  } catch (error) {
    next(error);
  }
}

export async function getMyHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return errorResponse(res, 'Unauthorized', 'UNAUTHORIZED', 401);
    }

    const { dateFilter, startDate, endDate, page, limit } = req.query;

    const result = await dispatchService.getDispatchHistory({
      employeeId: req.user.id,
      dateFilter: dateFilter as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 10,
    });

    return successResponse(res, 'My dispatch history retrieved', result);
  } catch (error) {
    next(error);
  }
}

export async function getStockDispatchHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { date, bookCode } = req.query;
    const result = await dispatchService.getStockDispatchHistory({
      date: date as string,
      bookCode: bookCode as string,
    });
    return successResponse(res, 'Stock dispatch history retrieved', result);
  } catch (error) {
    next(error);
  }
}

export async function getFailedAttempts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { employeeId, dateFilter, startDate, endDate, page, limit } = req.query;

    const result = await dispatchService.getFailedAttempts({
      employeeId: employeeId as string,
      dateFilter: dateFilter as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 10,
    });

    return successResponse(res, 'Failed verification attempts retrieved', result);
  } catch (error) {
    next(error);
  }
}
