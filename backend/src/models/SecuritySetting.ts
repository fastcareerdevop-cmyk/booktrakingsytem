import mongoose, { Schema, Document } from 'mongoose';

export interface ISecuritySetting extends Document {
  key: string;
  pinHash: string;
  isConfigured: boolean;
  updatedByUserId?: mongoose.Types.ObjectId;
  updatedByUserName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SecuritySettingSchema = new Schema<ISecuritySetting>(
  {
    key: { type: String, required: true, unique: true, default: 'ADMIN_SECURITY_PIN' },
    pinHash: { type: String, required: true },
    isConfigured: { type: Boolean, default: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedByUserName: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret: any) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.pinHash;
        return ret;
      },
    },
  }
);

export const SecuritySetting = mongoose.model<ISecuritySetting>('SecuritySetting', SecuritySettingSchema);
