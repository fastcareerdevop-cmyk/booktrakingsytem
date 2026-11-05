import mongoose, { Schema, Document } from 'mongoose';

export interface IRbacAuditLog extends Document {
  targetUserId: mongoose.Types.ObjectId;
  targetName: string;
  targetEmail: string;
  targetEmployeeId?: string;
  actorUserId?: mongoose.Types.ObjectId;
  actorName: string;
  actorEmail?: string;
  action: 'EMPLOYEE_REGISTERED' | 'PERMISSIONS_UPDATED' | 'STATUS_CHANGED' | 'EMPLOYEE_CREATED';
  previousPermissions: string[];
  newPermissions: string[];
  previousStatus?: string;
  newStatus?: string;
  remarks?: string;
  ipAddress?: string;
  createdAt: Date;
}

const RbacAuditLogSchema = new Schema<IRbacAuditLog>(
  {
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetName: { type: String, required: true },
    targetEmail: { type: String, required: true },
    targetEmployeeId: { type: String },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, required: true },
    actorEmail: { type: String },
    action: {
      type: String,
      enum: ['EMPLOYEE_REGISTERED', 'PERMISSIONS_UPDATED', 'STATUS_CHANGED', 'EMPLOYEE_CREATED'],
      required: true,
    },
    previousPermissions: { type: [String], default: [] },
    newPermissions: { type: [String], default: [] },
    previousStatus: { type: String },
    newStatus: { type: String },
    remarks: { type: String },
    ipAddress: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
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

export const RbacAuditLog = mongoose.model<IRbacAuditLog>('RbacAuditLog', RbacAuditLogSchema);
