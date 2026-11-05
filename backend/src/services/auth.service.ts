import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { ENV } from '../config/env';
import { logAudit } from '../utils/audit';
import { DISPATCH_SYSTEM_PAGES } from '../config/rbacPages';

export async function loginUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw { statusCode: 401, message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' };
  }

  if (!user.isActive) {
    throw { statusCode: 403, message: 'Account is deactivated. Please contact an administrator.', code: 'ACCOUNT_DEACTIVATED' };
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw { statusCode: 401, message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' };
  }

  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    ENV.JWT_SECRET,
    { expiresIn: '7d' }
  );

  await logAudit({
    actorUserId: user._id.toString(),
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: user._id.toString(),
    metadata: { email: user.email, role: user.role },
  });

  const accessStatus = user.role === 'ADMIN' ? 'ACTIVE' : (user.accessStatus || (user.isActive ? 'ACTIVE' : 'RESTRICTED'));
  const permissions = user.role === 'ADMIN' 
    ? DISPATCH_SYSTEM_PAGES.map((p) => p.id)
    : (accessStatus === 'PENDING' ? [] : (user.permissions || []));

  return {
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      employeeId: user.employeeId,
      department: user.department,
      designation: user.designation,
      accessStatus,
      permissions,
    },
  };
}

export async function getCurrentUser(userId: string) {
  const user = await User.findById(userId).select(
    'name email role isActive employeeId mobileNumber department designation accessStatus permissions createdAt'
  );

  if (!user) {
    throw { statusCode: 404, message: 'User not found', code: 'USER_NOT_FOUND' };
  }

  const accessStatus = user.role === 'ADMIN' ? 'ACTIVE' : (user.accessStatus || (user.isActive ? 'ACTIVE' : 'RESTRICTED'));
  const permissions = user.role === 'ADMIN'
    ? DISPATCH_SYSTEM_PAGES.map((p) => p.id)
    : (accessStatus === 'PENDING' ? [] : (user.permissions || []));

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    employeeId: user.employeeId,
    mobileNumber: user.mobileNumber,
    department: user.department,
    designation: user.designation,
    accessStatus,
    permissions,
    createdAt: user.createdAt,
  };
}

export async function changeUserPassword(userId: string, currentPass: string, newPass: string) {
  const user = await User.findById(userId);

  if (!user) {
    throw { statusCode: 404, message: 'User not found', code: 'USER_NOT_FOUND' };
  }

  const isMatch = await bcrypt.compare(currentPass, user.passwordHash);
  if (!isMatch) {
    throw { statusCode: 400, message: 'Current password is incorrect', code: 'INVALID_CURRENT_PASSWORD' };
  }

  const newHash = await bcrypt.hash(newPass, 10);
  user.passwordHash = newHash;
  await user.save();

  await logAudit({
    actorUserId: userId,
    action: 'PASSWORD_CHANGED',
    entityType: 'User',
    entityId: userId,
  });

  return { message: 'Password changed successfully' };
}
