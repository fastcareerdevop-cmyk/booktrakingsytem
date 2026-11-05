import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { User } from '../models';
import { errorResponse } from '../utils/response';

export function requireActiveAccess() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return errorResponse(res, 'Authentication required', 'UNAUTHORIZED', 401);
    }

    if (req.user.role === 'ADMIN') {
      return next();
    }

    try {
      const user = await User.findById(req.user.id).select('accessStatus isActive');
      if (!user) {
        return errorResponse(res, 'User not found', 'USER_NOT_FOUND', 401);
      }

      if (user.accessStatus === 'PENDING') {
        return errorResponse(
          res,
          'Your registration is currently pending Administrator approval. Protected operations cannot be performed yet.',
          'ACCESS_PENDING_APPROVAL',
          403
        );
      }

      if (user.accessStatus === 'RESTRICTED' || !user.isActive) {
        return errorResponse(
          res,
          'Your account access has been restricted by the Administrator. Please contact management.',
          'ACCESS_RESTRICTED',
          403
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requirePagePermission(pageId: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return errorResponse(res, 'Authentication required', 'UNAUTHORIZED', 401);
    }

    // Administrators always have full system access
    if (req.user.role === 'ADMIN') {
      return next();
    }

    try {
      const user = await User.findById(req.user.id).select('accessStatus permissions isActive');
      if (!user) {
        return errorResponse(res, 'User not found', 'USER_NOT_FOUND', 401);
      }

      if (user.accessStatus === 'PENDING') {
        return errorResponse(
          res,
          'Your account registration is pending Admin authorization.',
          'ACCESS_PENDING_APPROVAL',
          403
        );
      }

      if (user.accessStatus === 'RESTRICTED' || !user.isActive) {
        return errorResponse(
          res,
          'Account access has been restricted by an administrator.',
          'ACCESS_RESTRICTED',
          403
        );
      }

      const permissions = user.permissions || [];
      if (!permissions.includes(pageId)) {
        return errorResponse(
          res,
          `Access Denied: You do not have permission to access the '${pageId}' module. Contact your administrator.`,
          'PAGE_ACCESS_DENIED',
          403
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
