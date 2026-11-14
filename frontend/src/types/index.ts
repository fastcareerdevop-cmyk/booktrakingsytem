export type Role = 'ADMIN' | 'EMPLOYEE';
export type AccessStatus = 'PENDING' | 'ACTIVE' | 'RESTRICTED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  employeeId?: string;
  mobileNumber?: string;
  department?: string;
  designation?: string;
  accessStatus?: AccessStatus;
  permissions?: string[];
  createdAt?: string;
}

export interface RbacPageItem {
  id: string;
  name: string;
  category: 'Operations' | 'Stock & Inventory' | 'Barcodes & Tracking' | 'History & Records' | 'Administration';
  description: string;
  employeePath: string;
  adminPath: string;
  defaultForEmployee?: boolean;
}

export interface RbacEmployee {
  id: string;
  name: string;
  employeeId: string;
  email: string;
  mobileNumber: string;
  department: string;
  designation: string;
  role: Role;
  isActive: boolean;
  accessStatus: AccessStatus;
  permissions: string[];
  permissionsCount?: number;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    dispatchLogs: number;
    verificationAttempts: number;
  };
}

export interface RbacAuditLogItem {
  id: string;
  targetUserId: string;
  targetName: string;
  targetEmail: string;
  targetEmployeeId?: string;
  actorUserId?: string;
  actorName: string;
  actorEmail?: string;
  action: 'EMPLOYEE_REGISTERED' | 'PERMISSIONS_UPDATED' | 'STATUS_CHANGED' | 'EMPLOYEE_CREATED';
  previousPermissions: string[];
  newPermissions: string[];
  previousStatus?: string;
  newStatus?: string;
  remarks?: string;
  ipAddress?: string;
  createdAt: string;
}

export type OrderStatus = 'PENDING' | 'PARTIALLY_DISPATCHED' | 'COMPLETED';
export type ItemStatus = 'PENDING' | 'PARTIALLY_DISPATCHED' | 'COMPLETED';

export interface OrderItem {
  id: string;
  orderId: string;
  productCode?: string;
  productName?: string;
  bookCode: string;
  bookName: string;
  requiredQuantity: number;
  dispatchedQuantity: number;
  pendingQuantity: number;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
  dispatchLogs?: DispatchLog[];
  verificationAttempts?: VerificationAttempt[];
}

export interface Order {
  id: string;
  orderCode?: string;
  productCode?: string;
  studentName: string;
  mobileNumber: string;
  email: string | null;
  emailSentAt?: string | null;
  whatsappSentAt?: string | null;
  trackingId: string;
  weight?: string;
  importBatchId: string;
  createdAt: string;
  updatedAt: string;
  totalRequired: number;
  totalDispatched: number;
  totalPending: number;
  status: OrderStatus;
  items: OrderItem[];
  importBatch?: {
    id: string;
    originalFileName: string;
    uploadedAt: string;
  };
}

export interface DispatchLog {
  id: string;
  orderItemId: string;
  employeeId: string;
  verifiedBookCode: string;
  quantity: number;
  dispatchedAt: string;
  result: string;
  employee?: {
    id: string;
    name: string;
    email: string;
  };
  orderItem?: {
    id: string;
    bookCode: string;
    bookName: string;
    order: {
      id: string;
      studentName: string;
      trackingId: string;
      mobileNumber?: string;
    };
  };
}

export interface VerificationAttempt {
  id: string;
  orderItemId: string;
  employeeId: string;
  enteredBookCode: string;
  success: boolean;
  failureReason: string | null;
  attemptedAt: string;
  employee?: {
    id: string;
    name: string;
    email: string;
  };
  orderItem?: {
    id: string;
    bookCode: string;
    bookName: string;
    order: {
      id: string;
      studentName: string;
      trackingId: string;
    };
  };
}

export interface ImportBatch {
  id: string;
  originalFileName: string;
  uploadedByUserId: string;
  uploadedAt: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  fileHash: string;
  errorSummary?: any;
  uploadedByUser?: {
    id: string;
    name: string;
    email: string;
  };
  _count?: {
    orders: number;
  };
}

export interface DashboardSummary {
  totalOrders: number;
  totalStudents: number;
  totalBookTypes: number;
  totalRequiredCopies: number;
  totalDispatchedCopies: number;
  totalPendingCopies: number;
  completedOrders: number;
  partiallyDispatchedOrders: number;
  pendingOrders: number;
  todayDispatches: number;
  totalImportBatches: number;
}

export interface BookSummaryItem {
  bookCode: string;
  bookName: string;
  totalRequired: number;
  totalDispatched: number;
  totalPending: number;
  ordersCount: number;
}

export interface EmployeeSummaryItem {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  totalDispatches: number;
  failedAttempts: number;
  successRate: number;
}

export interface AuditLogItem {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: any;
  createdAt: string;
  actorUser?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
}
