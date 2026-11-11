import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as securityService from '../services/security.service';
import { successResponse, errorResponse } from '../utils/response';

export async function getStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const status = await securityService.getPinStatus();
    return successResponse(res, 'Security PIN status retrieved', status);
  } catch (error) {
    next(error);
  }
}

export async function setPin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return errorResponse(res, 'Unauthorized', 'UNAUTHORIZED', 401);
    }

    const { pin } = req.body;
    if (!pin) {
      return errorResponse(res, '4-digit PIN is required', 'PIN_REQUIRED', 400);
    }

    const result = await securityService.setSecurityPin(pin, {
      id: req.user.id,
      name: req.user.name,
    });

    return successResponse(res, result.message, result);
  } catch (error) {
    next(error);
  }
}

export async function verifyPin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { pin } = req.body;
    if (!pin) {
      return errorResponse(res, 'PIN is required for verification', 'PIN_REQUIRED', 400);
    }

    await securityService.verifySecurityPin(pin);
    return successResponse(res, 'PIN verified successfully', { verified: true });
  } catch (error) {
    next(error);
  }
}
