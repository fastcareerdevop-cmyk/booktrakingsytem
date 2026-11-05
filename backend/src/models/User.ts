import mongoose, { Schema, Document } from 'mongoose';

export type Role = 'ADMIN' | 'EMPLOYEE';
export type AccessStatus = 'PENDING' | 'ACTIVE' | 'RESTRICTED';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  employeeId?: string;
  mobileNumber?: string;
  department?: string;
  designation?: string;
  accessStatus: AccessStatus;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_PERMS = [
  'dashboard',
  'dispatch_entry',
  'outgoing_orders_2',
  'preparation',
  'stock_inward',
  'available_stock',
  'pending_stock',
  'barcode_sheet',
  'barcode_catalog',
  'dispatch_list',
];

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'EMPLOYEE'], default: 'EMPLOYEE' },
    isActive: { type: Boolean, default: true },
    employeeId: { type: String, trim: true, sparse: true },
    mobileNumber: { type: String, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    accessStatus: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'RESTRICTED'],
      default: 'ACTIVE',
    },
    permissions: {
      type: [String],
      default: DEFAULT_PERMS,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret: any) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const User = mongoose.model<IUser>('User', UserSchema);
