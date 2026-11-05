import { z } from 'zod';

export const registerEmployeeSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  department: z.string().optional(),
  employeeId: z.string().optional(),
  mobileNumber: z.string().optional(),
  designation: z.string().optional(),
});

export const updatePermissionsSchema = z.object({
  permissions: z.array(z.string()).default([]),
  accessStatus: z.enum(['PENDING', 'ACTIVE', 'RESTRICTED']).optional(),
  remarks: z.string().optional(),
});

export const updateAccessStatusSchema = z.object({
  accessStatus: z.enum(['PENDING', 'ACTIVE', 'RESTRICTED']),
  remarks: z.string().optional(),
});
