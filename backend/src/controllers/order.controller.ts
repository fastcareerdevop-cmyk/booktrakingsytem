import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as orderService from '../services/order.service';
import { successResponse, errorResponse } from '../utils/response';

export async function getOrders(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const {
      search,
      status,
      bookCode,
      batchId,
      dateFilter,
      startDate,
      endDate,
      page,
      limit,
    } = req.query;

    const result = await orderService.listOrders({
      search: search as string,
      status: status as string,
      bookCode: bookCode as string,
      batchId: batchId as string,
      dateFilter: dateFilter as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 10,
      outgoingOnly: false,
    });

    return successResponse(res, 'Orders retrieved', result);
  } catch (error) {
    next(error);
  }
}

export async function getOutgoingOrders(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const {
      search,
      status,
      bookCode,
      batchId,
      dateFilter,
      startDate,
      endDate,
      page,
      limit,
    } = req.query;

    const result = await orderService.listOrders({
      search: search as string,
      status: status as string,
      bookCode: bookCode as string,
      batchId: batchId as string,
      dateFilter: dateFilter as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 10,
      outgoingOnly: true,
    });

    return successResponse(res, 'Outgoing orders retrieved', result);
  } catch (error) {
    next(error);
  }
}

export async function markOrderEmailSent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const order = await orderService.markOrderEmailSent(id, req.user?.id || 'system');
    const emailStatus = order.emailDelivery?.sent ? 'sent' : 'not sent';
    const whatsappStatus = order.whatsappDelivery?.sent ? 'sent' : 'not sent';
    return successResponse(res, `Notification result — email: ${emailStatus}; WhatsApp: ${whatsappStatus}.`, order);
  } catch (error) {
    next(error);
  }
}

export async function retryOrderWhatsApp(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await orderService.retryOrderWhatsApp(id, req.user?.id || 'system');
    const status = result.whatsappDelivery.sent ? 'accepted by Teleobi' : 'not sent';
    return successResponse(res, `WhatsApp notification ${status}.`, result);
  } catch (error) {
    next(error);
  }
}

export async function getOrderById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const order = await orderService.getOrderById(id);
    return successResponse(res, 'Order details retrieved', order);
  } catch (error) {
    next(error);
  }
}

export async function getOrderItems(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const order = await orderService.getOrderById(id);
    return successResponse(res, 'Order items retrieved', order.items);
  } catch (error) {
    next(error);
  }
}

export async function getBarcodeSheet(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { batchId, search } = req.query;
    const result = await orderService.getBarcodeSheetData({
      batchId: batchId as string,
      search: search as string,
    });
    return successResponse(res, 'Barcode sheet data retrieved', result);
  } catch (error) {
    next(error);
  }
}

export async function clearAllOrders(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return errorResponse(res, 'Only administrators can clear database orders', 'UNAUTHORIZED', 403);
    }
    const result = await orderService.clearAllOrders(req.user.id);
    return successResponse(res, result.message, result);
  } catch (error) {
    next(error);
  }
}

export async function deleteOrders(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds) || orderIds.some((id: unknown) => typeof id !== 'string')) {
      return errorResponse(res, 'orderIds must be an array of order IDs', 'INVALID_ORDER_IDS', 400);
    }
    const result = await orderService.deleteOrders(req.user!.id, orderIds);
    return successResponse(res, result.message, result);
  } catch (error) {
    next(error);
  }
}

export async function adminUpdateOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return errorResponse(res, 'Only administrators can edit order details', 'UNAUTHORIZED', 403);
    }
    const { id } = req.params;
    const { pin, studentName, mobileNumber, email, trackingId, productCode, items } = req.body;

    if (!pin) {
      return errorResponse(res, '4-digit Security PIN is required to update order', 'PIN_REQUIRED', 400);
    }

    const updated = await orderService.adminUpdateOrder(
      id,
      { pin, studentName, mobileNumber, email, trackingId, productCode, items },
      { id: req.user.id, name: req.user.name }
    );

    return successResponse(res, 'Order details updated successfully with PIN authorization.', updated);
  } catch (error) {
    next(error);
  }
}
