import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middleware/auth';
import { verifyDispatchSchema } from '../validators/dispatch.validator';
import * as dispatchService from '../services/dispatch.service';
import { Order, BookStock, DispatchLog, VerificationAttempt, PackagePreparation } from '../models';
import { successResponse, errorResponse } from '../utils/response';
import * as orderService from '../services/order.service';
import { computeOrderStatus, computeItemStatus } from '../services/order.service';
import { normalizeBookCode } from '../utils/normalize';
import { logAudit } from '../utils/audit';
import * as securityService from '../services/security.service';

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

    const { orderItemId, orderId, enteredBookCode, enteredCode, requestId, action, pin, isManual } = req.body;
    const scannedCode = (enteredCode || enteredBookCode || '').trim().toUpperCase();

    let targetOrderId = orderId;
    if (!targetOrderId && orderItemId) {
      const parentOrder = await Order.findOne({ 'items._id': orderItemId });
      if (parentOrder) {
        targetOrderId = parentOrder._id.toString();
      }
    }

    // Verify 4-digit Security PIN for manual actions if PIN is configured
    if ((action === 'MANUAL_FINISH_ORDER' || action === 'QUICK_DISPATCH_ALL' || isManual) && targetOrderId) {
      const pinStatus = await securityService.getPinStatus();
      if (pinStatus.isConfigured) {
        if (!pin) {
          return errorResponse(res, '4-digit Security PIN is required for manual order dispatch.', 'PIN_REQUIRED', 400);
        }
        await securityService.verifySecurityPin(pin);
      }
    }

    // 0. Manual action: Finish partial order or quick dispatch all
    if (action === 'MANUAL_FINISH_ORDER' && targetOrderId) {
      const order = await Order.findById(targetOrderId);
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

    if (action === 'QUICK_DISPATCH_ALL' && targetOrderId) {
      const order = await Order.findById(targetOrderId);
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

    // 0B. Compulsory Tracking ID Match: Deduct stock and fulfill order ONLY when Tracking ID matches!
    if (action === 'CONFIRM_DISPATCH_WITH_TRACKING' && targetOrderId) {
      const trackingCode = (req.body.trackingCode || enteredCode || '').trim().toUpperCase();
      if (!trackingCode) {
        return errorResponse(res, 'Tracking ID scan karna anivarya hai.', 'TRACKING_ID_REQUIRED', 400);
      }

      const order = await Order.findById(targetOrderId);
      if (!order) {
        return errorResponse(res, 'Order not found', 'ORDER_NOT_FOUND', 404);
      }

      if (computeOrderStatus(order.items) === 'COMPLETED') {
        return errorResponse(
          res,
          `❌ Order "${order.trackingId || order.orderCode}" (${order.studentName}) pehle se hi fully dispatch ho chuka hai!`,
          'ORDER_ALREADY_COMPLETED',
          400
        );
      }

      // Check tracking code match against expected Tracking ID or Order Code
      const cleanScanned = trackingCode.replace(/[\s\-_]/g, '').toUpperCase();
      const cleanExpectedTracking = (order.trackingId || '').replace(/[\s\-_]/g, '').toUpperCase();
      const cleanExpectedOrder = (order.orderCode || '').replace(/[\s\-_]/g, '').toUpperCase();

      const isMatch = (cleanExpectedTracking && cleanScanned === cleanExpectedTracking) ||
                      (cleanExpectedOrder && cleanScanned === cleanExpectedOrder);

      if (!isMatch) {
        return errorResponse(
          res,
          `❌ Galat Tracking ID "${trackingCode}"! Sahi Tracking ID: "${order.trackingId || order.orderCode}"`,
          'TRACKING_ID_MISMATCH',
          400
        );
      }

      // Tracking ID MATCHED! Atomically deduct stock from BookStock and complete order items!
      for (const item of order.items) {
        const remaining = item.requiredQuantity - item.dispatchedQuantity;
        if (remaining <= 0) continue;

        const cleanCode = normalizeBookCode(item.bookCode);

        // Update item in order
        await Order.updateOne(
          { _id: order._id, 'items._id': item._id },
          { $set: { 'items.$.dispatchedQuantity': item.requiredQuantity } }
        );

        // Deduct warehouse stock
        await BookStock.findOneAndUpdate(
          { bookCode: cleanCode },
          {
            $setOnInsert: {
              bookCode: cleanCode,
              totalInward: 0,
              lowStockThreshold: 10,
              lastRestockedAt: new Date(),
            },
            $set: { bookName: item.bookName },
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
          employeeId: new mongoose.Types.ObjectId(req.user.id),
          verifiedBookCode: item.bookCode,
          quantity: remaining,
          requestId: requestId ? `${requestId}-${item._id}` : undefined,
          result: 'SUCCESS',
          dispatchMode: 'TRACKING_VERIFIED',
        });

        await VerificationAttempt.create({
          orderId: order._id,
          orderItemId: item._id.toString(),
          employeeId: new mongoose.Types.ObjectId(req.user.id),
          enteredBookCode: trackingCode,
          success: true,
        });
      }

      const updatedOrder = await Order.findById(order._id);
      const totalRequired = updatedOrder!.items.reduce((acc: number, i: any) => acc + i.requiredQuantity, 0);
      const totalDispatched = updatedOrder!.items.reduce((acc: number, i: any) => acc + i.dispatchedQuantity, 0);

      await logAudit({
        actorUserId: req.user.id,
        action: 'ORDER_DISPATCHED_WITH_TRACKING_MATCH',
        entityType: 'Order',
        entityId: order._id.toString(),
        metadata: {
          trackingCode,
          student: order.studentName,
          totalDispatched,
        },
      });

      const notification = await notifyOrderWhenFullyDispatched(
        updatedOrder!._id.toString(),
        req.user.id,
        0
      );

      return successResponse(
        res,
        `Tracking ID "${trackingCode}" matched successfully! Order for ${order.studentName} fulfilled and stock deducted.`,
        {
          scanType: 'TRACKING_MATCHED_AND_DISPATCHED',
          notification,
          order: {
            id: updatedOrder!._id.toString(),
            orderCode: updatedOrder!.orderCode,
            productCode: updatedOrder!.productCode,
            studentName: updatedOrder!.studentName,
            mobileNumber: updatedOrder!.mobileNumber,
            trackingId: updatedOrder!.trackingId,
            totalRequired,
            totalDispatched,
            totalPending: 0,
            status: 'COMPLETED',
            items: updatedOrder!.items.map((i: any) => ({
              id: i._id.toString(),
              productCode: i.productCode || updatedOrder!.productCode,
              productName: i.productName || 'Product',
              bookCode: i.bookCode,
              bookName: i.bookName,
              requiredQuantity: i.requiredQuantity,
              dispatchedQuantity: i.dispatchedQuantity,
              pendingQuantity: 0,
              status: 'DISPATCHED',
            })),
          },
        }
      );
    }

    if (!scannedCode) {
      return errorResponse(res, 'No code entered. Please scan or type a code.', 'CODE_REQUIRED', 400);
    }

    if (scannedCode.length < 4 || scannedCode === 'ORD-' || scannedCode === 'PRD-' || scannedCode === 'BK-' || scannedCode === 'UNQ-') {
      return errorResponse(res, `Incomplete code "${scannedCode}". Please scan or enter the complete barcode.`, 'INCOMPLETE_CODE', 400);
    }

    // Check if there is an active order loaded on screen and whether scannedCode belongs to it as a book or product
    const activeOrderForContext = targetOrderId ? await Order.findById(targetOrderId) : null;
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
      if (totalPending === 0 || computeOrderStatus(matchedByOrderCode.items) === 'COMPLETED') {
        return errorResponse(
          res,
          `❌ Order "${matchedByOrderCode.trackingId || matchedByOrderCode.orderCode}" (${matchedByOrderCode.studentName}) pehle se hi fully dispatch ho chuka hai! Ise dubara scan nahi kiya ja sakta.`,
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
    if (targetOrderId) {
      const activeOrder = activeOrderForContext || await Order.findById(targetOrderId);
      if (activeOrder) {
        const orderRemaining = activeOrder.items.reduce(
          (acc: number, i: any) => acc + Math.max(0, i.requiredQuantity - i.dispatchedQuantity),
          0
        );
        if (orderRemaining === 0 || computeOrderStatus(activeOrder.items) === 'COMPLETED') {
          return errorResponse(
            res,
            `❌ Order "${activeOrder.trackingId || activeOrder.orderCode}" (${activeOrder.studentName}) pehle se hi fully dispatch ho chuka hai! Ise dubara scan nahi kiya ja sakta.`,
            'ORDER_ALREADY_COMPLETED',
            400
          );
        }

        // A. Check if scannedCode matches this active order's product code or any item's product code
        const cleanScanned = normalizeBookCode(scannedCode);

        // Find items in this order that belong to this productCode
        const targetProductItems = activeOrder.items.filter((i: any) => {
          const itemPCode = normalizeBookCode(i.productCode || '');
          if (itemPCode) {
            return itemPCode === cleanScanned;
          }
          // If item doesn't have an explicit productCode, fallback to activeOrder.productCode
          return normalizeBookCode(activeOrder.productCode || '') === cleanScanned;
        });

        if (targetProductItems.length > 0) {
          const pendingItemsForProduct = targetProductItems.filter(
            (i: any) => i.requiredQuantity > i.dispatchedQuantity
          );

          if (pendingItemsForProduct.length === 0) {
            return errorResponse(
              res,
              `❌ Product "${scannedCode}" is already fully verified for this order! Double scan prevented. Please scan remaining products/books.`,
              'ALREADY_VERIFIED',
              400
            );
          }

          let itemsDispatchedNow = 0;

          // Increment 1 copy / set per scan for this product
          for (const item of pendingItemsForProduct) {
            itemsDispatchedNow += 1;

            // Increment item in Order atomically by 1
            await Order.updateOne(
              { _id: activeOrder._id, 'items._id': item._id },
              { $inc: { 'items.$.dispatchedQuantity': 1 } }
            );

            // Deduct 1 from warehouse BookStock master
            const cleanBCode = normalizeBookCode(item.bookCode);
            await BookStock.findOneAndUpdate(
              { bookCode: cleanBCode },
              {
                $setOnInsert: {
                  bookCode: cleanBCode,
                  totalInward: 0,
                  lowStockThreshold: 10,
                  lastRestockedAt: new Date(),
                },
                $set: { bookName: item.bookName },
                $inc: {
                  availableQuantity: -1,
                  totalDispatched: 1,
                },
              },
              { upsert: true, new: true, setDefaultsOnInsert: false }
            );

            // Create DispatchLog
            await DispatchLog.create({
              orderId: activeOrder._id,
              orderItemId: item._id.toString(),
              employeeId: new mongoose.Types.ObjectId(req.user.id),
              verifiedBookCode: item.bookCode,
              quantity: 1,
              result: 'SUCCESS',
              dispatchMode: 'PRODUCT_CODE_SCAN',
              verifiedAt: new Date(),
            });
          }

          // Also adjust PackagePreparation packagedStock if pre-packaged parcels were ready
          try {
            const prepDoc = await PackagePreparation.findOne({
              productCode: cleanScanned,
              packagedStock: { $gt: 0 },
            });
            if (prepDoc) {
              prepDoc.packagedStock = Math.max(0, prepDoc.packagedStock - 1);
              await prepDoc.save();
            }
          } catch (e) {}

          // Re-fetch updated order to evaluate overall completeness
          const updatedOrder = (await Order.findById(activeOrder._id))!;
          const totalRequired = updatedOrder.items.reduce((acc: number, i: any) => acc + i.requiredQuantity, 0);
          const totalDispatched = updatedOrder.items.reduce((acc: number, i: any) => acc + i.dispatchedQuantity, 0);
          const totalPending = Math.max(0, totalRequired - totalDispatched);
          const isOrderComplete = totalPending === 0;

          const notification = isOrderComplete
            ? await notifyOrderWhenFullyDispatched(
                updatedOrder._id.toString(),
                req.user.id,
                0
              )
            : undefined;

          const msg = isOrderComplete
            ? `Product Code "${scannedCode}" Scanned & Verified! All ${totalRequired} books verified in parcel. Ab parcel ka Tracking ID scan karein.`
            : `Product Code "${scannedCode}" Scanned & Verified! (${itemsDispatchedNow} copies). Ab baaki ke products / books scan karein (${totalPending} bachi hain).`;

          return successResponse(
            res,
            msg,
            {
              scanType: 'PRODUCT_CODE',
              allBooksVerified: isOrderComplete,
              requiresTrackingMatch: isOrderComplete,
              message: msg,
              itemsDispatched: itemsDispatchedNow,
              notification,
              order: {
                id: updatedOrder._id.toString(),
                orderCode: updatedOrder.orderCode,
                productCode: updatedOrder.productCode,
                studentName: updatedOrder.studentName,
                mobileNumber: updatedOrder.mobileNumber,
                trackingId: updatedOrder.trackingId,
                totalRequired,
                totalDispatched,
                totalPending,
                allVerified: isOrderComplete,
                status: isOrderComplete ? 'VERIFYING_TRACKING' : 'PARTIALLY_DISPATCHED',
                items: updatedOrder.items.map((i: any) => ({
                  id: i._id.toString(),
                  productCode: i.productCode || updatedOrder.productCode,
                  productName: i.productName || 'Product',
                  bookCode: i.bookCode,
                  bookName: i.bookName,
                  requiredQuantity: i.requiredQuantity,
                  dispatchedQuantity: i.dispatchedQuantity,
                  pendingQuantity: Math.max(0, i.requiredQuantity - i.dispatchedQuantity),
                  isVerified: i.dispatchedQuantity >= i.requiredQuantity,
                  status: computeItemStatus(i.requiredQuantity, i.dispatchedQuantity),
                })),
              },
            }
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

    // 3. STRICT RULE: Student Barcode MUST be scanned before any Product or Book Barcode!
    // If no student order is loaded on screen, scanning a product or book code is strictly prohibited.
    return errorResponse(
      res,
      `⚠️ Pehle Student Barcode scan karein! Student barcode scan hone ke baad hi uske products scan ho sakte hain. (Aapne scan kiya: "${scannedCode}")`,
      'STUDENT_SCAN_REQUIRED_FIRST',
      400
    );
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
