import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderItem {
  _id: mongoose.Types.ObjectId;
  productCode: string;       // From Excel e.g. PRD-CA-01; blank for book-only orders
  productName: string;       // From Excel e.g. CA Foundation Full Combo
  bookCode: string;          // From Excel e.g. QB101
  bookName: string;          // From Excel e.g. Quantitative Bank
  requiredQuantity: number;
  dispatchedQuantity: number;
}

export interface IOrder extends Document {
  orderCode: string;         // Auto-generated unique order code e.g. ORD-2410-00001
  productCode: string;       // Primary product code; blank for book-only orders
  studentName: string;
  mobileNumber: string;
  email: string | null;
  emailSentAt: Date | null;
  whatsappSentAt: Date | null;
  trackingId: string;
  weight?: string;
  city?: string;
  address?: string;
  courierName?: string;
  courierTrackingUrl?: string;
  importBatchId: mongoose.Types.ObjectId;
  items: IOrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productCode: { type: String, uppercase: true, trim: true, default: '', index: true },
    productName: { type: String, trim: true, default: 'Default Product' },
    bookCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    bookName: { type: String, required: true, trim: true },
    requiredQuantity: { type: Number, required: true, min: 1 },
    dispatchedQuantity: { type: Number, default: 0, min: 0 },
  },
  {
    toJSON: {
      virtuals: true,
      transform: (doc, ret: any) => {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

const OrderSchema = new Schema<IOrder>(
  {
    orderCode: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    productCode: { type: String, uppercase: true, trim: true, default: '', index: true },
    studentName: { type: String, required: true, trim: true, index: true },
    mobileNumber: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true, default: null },
    emailSentAt: { type: Date, default: null },
    whatsappSentAt: { type: Date, default: null },
    trackingId: { type: String, required: true, trim: true, uppercase: true, index: true },
    weight: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    courierName: { type: String, trim: true, default: '' },
    courierTrackingUrl: { type: String, trim: true, default: '' },
    importBatchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true, index: true },
    items: [OrderItemSchema],
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

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
