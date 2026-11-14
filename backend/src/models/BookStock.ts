import mongoose, { Schema, Document } from 'mongoose';

export interface IBookStock extends Document {
  bookCode: string;          // Unique book barcode/SKU e.g. IAEBR-001
  bookName: string;          // Book title e.g. Auditing & Ethics Regular
  productCode?: string;      // Associated product combo code (optional)
  totalInward: number;       // Lifetime total copies received through stock inward
  totalDispatched: number;   // Lifetime total copies dispatched in outgoing
  availableQuantity: number; // Current live warehouse stock (totalInward - totalDispatched)
  lowStockThreshold: number; // Low stock warning threshold (default: 10)
  lastRestockedAt: Date;     // Date and time when stock was last inwarded
  isActive?: boolean;        // Active flag for barcode catalog and ordering
  createdAt: Date;
  updatedAt: Date;
}

const BookStockSchema = new Schema<IBookStock>(
  {
    bookCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    bookName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    productCode: {
      type: String,
      uppercase: true,
      trim: true,
      default: '',
    },
    totalInward: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDispatched: {
      type: Number,
      default: 0,
      min: 0,
    },
    availableQuantity: {
      type: Number,
      default: 0,
      index: true,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: 1,
    },
    lastRestockedAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
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

export const BookStock = mongoose.model<IBookStock>('BookStock', BookStockSchema);
