import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  registerEmployeeSchema,
  updatePermissionsSchema,
  updateAccessStatusSchema,
} from '../validators/rbac.validator';
import * as rbacService from '../services/rbac.service';
import { successResponse, errorResponse } from '../utils/response';
import { DISPATCH_SYSTEM_PAGES } from '../config/rbacPages';

export async function registerEmployee(req: Request, res: Response, next: NextFunction) {
  try {
    const validated = registerEmployeeSchema.parse(req.body);
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const result = await rbacService.registerEmployee(validated, clientIp);

    return successResponse(
      res,
      'Registration submitted successfully! Your account is currently in "Pending Access" status awaiting Administrator approval.',
      result,
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function getEmployees(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { search, department, status } = req.query;
    const employees = await rbacService.listEmployeesRbac({
      search: search as string | undefined,
      department: department as string | undefined,
      status: status as string | undefined,
    });

    return successResponse(res, 'RBAC employee list retrieved', employees);
  } catch (error) {
    next(error);
  }
}

export async function getEmployeeById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const detail = await rbacService.getEmployeeRbacDetail(id);
    return successResponse(res, 'Employee RBAC details retrieved', detail);
  } catch (error) {
    next(error);
  }
}

export async function updatePermissions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return errorResponse(res, 'Unauthorized', 'UNAUTHORIZED', 401);
    }

    const { id } = req.params;
    const validated = updatePermissionsSchema.parse(req.body);
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    const updated = await rbacService.updateEmployeePermissions(
      id,
      validated.permissions,
      validated.accessStatus,
      { id: req.user.id, name: req.user.name, email: req.user.email },
      validated.remarks,
      clientIp
    );

    return successResponse(
      res,
      `Permissions successfully updated for employee (${updated.permissions.length} pages granted).`,
      updated
    );
  } catch (error) {
    next(error);
  }
}

export async function updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return errorResponse(res, 'Unauthorized', 'UNAUTHORIZED', 401);
    }

    const { id } = req.params;
    const validated = updateAccessStatusSchema.parse(req.body);
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    const updated = await rbacService.updateEmployeeStatusRbac(
      id,
      validated.accessStatus,
      { id: req.user.id, name: req.user.name, email: req.user.email },
      validated.remarks,
      clientIp
    );

    return successResponse(
      res,
      `Access status changed to ${validated.accessStatus}.`,
      updated
    );
  } catch (error) {
    next(error);
  }
}

export async function getAuditLogs(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { search, page, limit } = req.query;
    const result = await rbacService.getRbacAuditLogs({
      search: search as string | undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 50,
    });

    return successResponse(res, 'RBAC access audit logs retrieved', result);
  } catch (error) {
    next(error);
  }
}

export async function getSystemPages(req: AuthenticatedRequest, res: Response) {
  return successResponse(res, 'System pages retrieved', DISPATCH_SYSTEM_PAGES);
}

export async function getMyPermissions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return errorResponse(res, 'Unauthorized', 'UNAUTHORIZED', 401);
    }

    const perms = await rbacService.getUserPermissions(req.user.id);
    return successResponse(res, 'User permissions retrieved', perms);
  } catch (error) {
    next(error);
  }
}
