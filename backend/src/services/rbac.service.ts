import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, RbacAuditLog, DispatchLog, VerificationAttempt } from '../models';
import { DISPATCH_SYSTEM_PAGES } from '../config/rbacPages';

interface RegisterEmployeeInput {
  name: string;
  employeeId: string;
  email: string;
  mobileNumber: string;
  department: string;
  designation: string;
  password: string;
}

export async function registerEmployee(data: RegisterEmployeeInput, ipAddress?: string) {
  const normalizedEmail = data.email.trim().toLowerCase();
  const normalizedEmployeeId = data.employeeId.trim().toUpperCase();

  // Check if email already registered
  const existingByEmail = await User.findOne({ email: normalizedEmail });
  if (existingByEmail) {
    throw { statusCode: 400, message: 'An account with this email address already exists.', code: 'EMAIL_EXISTS' };
  }

  // Check if Employee ID already registered
  const existingById = await User.findOne({ employeeId: normalizedEmployeeId });
  if (existingById) {
    throw { statusCode: 400, message: `Employee ID "${normalizedEmployeeId}" is already assigned to another user.`, code: 'EMPLOYEE_ID_EXISTS' };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const newUser = await User.create({
    name: data.name.trim(),
    employeeId: normalizedEmployeeId,
    email: normalizedEmail,
    mobileNumber: data.mobileNumber.trim(),
    department: data.department.trim(),
    designation: data.designation.trim(),
    passwordHash,
    role: 'EMPLOYEE',
    isActive: true,
    accessStatus: 'PENDING',
    permissions: [],
  });

  // Log in RBAC Audit History
  await RbacAuditLog.create({
    targetUserId: newUser._id,
    targetName: newUser.name,
    targetEmail: newUser.email,
    targetEmployeeId: newUser.employeeId,
    actorUserId: newUser._id,
    actorName: `${newUser.name} (Self-Registered)`,
    actorEmail: newUser.email,
    action: 'EMPLOYEE_REGISTERED',
    previousPermissions: [],
    newPermissions: [],
    previousStatus: 'NONE',
    newStatus: 'PENDING',
    remarks: 'New employee registration submitted. Awaiting Admin access approval.',
    ipAddress,
  });

  return {
    id: newUser._id.toString(),
    name: newUser.name,
    employeeId: newUser.employeeId,
    email: newUser.email,
    mobileNumber: newUser.mobileNumber,
    department: newUser.department,
    designation: newUser.designation,
    role: newUser.role,
    accessStatus: newUser.accessStatus,
    permissions: newUser.permissions,
    createdAt: newUser.createdAt,
  };
}

export async function listEmployeesRbac(filters: { search?: string; department?: string; status?: string }) {
  const query: any = { role: 'EMPLOYEE' };

  if (filters.search) {
    const term = filters.search.trim();
    query.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { employeeId: { $regex: term, $options: 'i' } },
      { designation: { $regex: term, $options: 'i' } },
    ];
  }

  if (filters.department && filters.department !== 'ALL') {
    query.department = filters.department;
  }

  if (filters.status && filters.status !== 'ALL') {
    query.accessStatus = filters.status;
  }

  const employees = await User.find(query).sort({ createdAt: -1 });

  return await Promise.all(
    employees.map(async (emp) => {
      const [dispatchesCount, attemptsCount] = await Promise.all([
        DispatchLog.countDocuments({ employeeId: emp._id, result: 'SUCCESS' }),
        VerificationAttempt.countDocuments({ employeeId: emp._id }),
      ]);

      const accessStatus = emp.accessStatus || (emp.isActive ? 'ACTIVE' : 'RESTRICTED');
      const permissions = emp.permissions || [];

      return {
        id: emp._id.toString(),
        name: emp.name,
        employeeId: emp.employeeId || `EMP-${emp._id.toString().slice(-4).toUpperCase()}`,
        email: emp.email,
        mobileNumber: emp.mobileNumber || 'N/A',
        department: emp.department || 'Operations',
        designation: emp.designation || 'Staff Executive',
        role: emp.role,
        isActive: emp.isActive,
        accessStatus,
        permissions,
        permissionsCount: permissions.length,
        createdAt: emp.createdAt,
        updatedAt: emp.updatedAt,
        _count: {
          dispatchLogs: dispatchesCount,
          verificationAttempts: attemptsCount,
        },
      };
    })
  );
}

export async function getEmployeeRbacDetail(id: string) {
  const emp = await User.findById(id);
  if (!emp) {
    throw { statusCode: 404, message: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' };
  }

  const historyLogs = await RbacAuditLog.find({ targetUserId: emp._id })
    .sort({ createdAt: -1 })
    .limit(20);

  return {
    employee: {
      id: emp._id.toString(),
      name: emp.name,
      employeeId: emp.employeeId || `EMP-${emp._id.toString().slice(-4).toUpperCase()}`,
      email: emp.email,
      mobileNumber: emp.mobileNumber || 'N/A',
      department: emp.department || 'Operations',
      designation: emp.designation || 'Staff Executive',
      role: emp.role,
      isActive: emp.isActive,
      accessStatus: emp.accessStatus || (emp.isActive ? 'ACTIVE' : 'RESTRICTED'),
      permissions: emp.permissions || [],
      createdAt: emp.createdAt,
      updatedAt: emp.updatedAt,
    },
    history: historyLogs,
  };
}

export async function updateEmployeePermissions(
  employeeId: string,
  newPermissions: string[],
  accessStatus: 'PENDING' | 'ACTIVE' | 'RESTRICTED' | undefined,
  adminUser: { id: string; name: string; email: string },
  remarks?: string,
  ipAddress?: string
) {
  const employee = await User.findById(employeeId);
  if (!employee) {
    throw { statusCode: 404, message: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' };
  }

  if (employee.role === 'ADMIN') {
    throw { statusCode: 400, message: 'Cannot modify permissions of Administrator account via employee RBAC.', code: 'CANNOT_MODIFY_ADMIN' };
  }

  if (employee._id.toString() === adminUser.id) {
    throw { statusCode: 403, message: 'Self-modification of permissions is strictly prohibited.', code: 'FORBIDDEN_SELF_MODIFY' };
  }

  const previousPermissions = employee.permissions || [];
  const previousStatus = employee.accessStatus || (employee.isActive ? 'ACTIVE' : 'RESTRICTED');

  // Determine target status
  let finalStatus = accessStatus;
  if (!finalStatus) {
    if (newPermissions.length > 0 && previousStatus === 'PENDING') {
      finalStatus = 'ACTIVE';
    } else {
      finalStatus = previousStatus;
    }
  }

  employee.permissions = newPermissions;
  employee.accessStatus = finalStatus;
  employee.isActive = finalStatus !== 'RESTRICTED';

  await employee.save();

  // Log in RBAC Audit History
  await RbacAuditLog.create({
    targetUserId: employee._id,
    targetName: employee.name,
    targetEmail: employee.email,
    targetEmployeeId: employee.employeeId,
    actorUserId: new mongoose.Types.ObjectId(adminUser.id),
    actorName: adminUser.name,
    actorEmail: adminUser.email,
    action: 'PERMISSIONS_UPDATED',
    previousPermissions,
    newPermissions,
    previousStatus,
    newStatus: finalStatus,
    remarks: remarks || `Permissions updated by Admin ${adminUser.name}. Total pages granted: ${newPermissions.length}.`,
    ipAddress,
  });

  return {
    id: employee._id.toString(),
    name: employee.name,
    employeeId: employee.employeeId,
    email: employee.email,
    accessStatus: employee.accessStatus,
    permissions: employee.permissions,
    updatedAt: employee.updatedAt,
  };
}

export async function updateEmployeeStatusRbac(
  employeeId: string,
  newStatus: 'PENDING' | 'ACTIVE' | 'RESTRICTED',
  adminUser: { id: string; name: string; email: string },
  remarks?: string,
  ipAddress?: string
) {
  const employee = await User.findById(employeeId);
  if (!employee) {
    throw { statusCode: 404, message: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' };
  }

  if (employee.role === 'ADMIN') {
    throw { statusCode: 400, message: 'Cannot modify status of Administrator account.', code: 'CANNOT_MODIFY_ADMIN' };
  }

  const previousStatus = employee.accessStatus || (employee.isActive ? 'ACTIVE' : 'RESTRICTED');
  employee.accessStatus = newStatus;
  employee.isActive = newStatus !== 'RESTRICTED';

  await employee.save();

  await RbacAuditLog.create({
    targetUserId: employee._id,
    targetName: employee.name,
    targetEmail: employee.email,
    targetEmployeeId: employee.employeeId,
    actorUserId: new mongoose.Types.ObjectId(adminUser.id),
    actorName: adminUser.name,
    actorEmail: adminUser.email,
    action: 'STATUS_CHANGED',
    previousPermissions: employee.permissions || [],
    newPermissions: employee.permissions || [],
    previousStatus,
    newStatus,
    remarks: remarks || `Access status changed from ${previousStatus} to ${newStatus} by Admin ${adminUser.name}.`,
    ipAddress,
  });

  return {
    id: employee._id.toString(),
    name: employee.name,
    accessStatus: employee.accessStatus,
    isActive: employee.isActive,
    updatedAt: employee.updatedAt,
  };
}

export async function getRbacAuditLogs(filters: { search?: string; page?: number; limit?: number }) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.max(1, Math.min(100, filters.limit || 50));
  const skip = (page - 1) * limit;

  const query: any = {};
  if (filters.search) {
    const term = filters.search.trim();
    query.$or = [
      { targetName: { $regex: term, $options: 'i' } },
      { targetEmail: { $regex: term, $options: 'i' } },
      { targetEmployeeId: { $regex: term, $options: 'i' } },
      { actorName: { $regex: term, $options: 'i' } },
      { remarks: { $regex: term, $options: 'i' } },
    ];
  }

  const [total, logs] = await Promise.all([
    RbacAuditLog.countDocuments(query),
    RbacAuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
  ]);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    logs,
  };
}

export async function getUserPermissions(userId: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw { statusCode: 404, message: 'User not found', code: 'USER_NOT_FOUND' };
  }

  if (user.role === 'ADMIN') {
    return {
      role: 'ADMIN',
      accessStatus: 'ACTIVE',
      permissions: DISPATCH_SYSTEM_PAGES.map((p) => p.id),
      allPages: DISPATCH_SYSTEM_PAGES,
    };
  }

  const accessStatus = user.accessStatus || (user.isActive ? 'ACTIVE' : 'RESTRICTED');
  
  // If user is PENDING, permissions list is empty
  let permissions = user.permissions || [];
  if (accessStatus === 'PENDING') {
    permissions = [];
  }

  return {
    role: user.role,
    accessStatus,
    permissions,
    allPages: DISPATCH_SYSTEM_PAGES,
  };
}
