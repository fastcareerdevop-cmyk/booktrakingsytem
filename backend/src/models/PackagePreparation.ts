import mongoose, { Schema, Document } from 'mongoose';

export interface IPackagePreparation extends Document {
  productCode: string;
  productName: string;
  books: {
    bookCode: string;
    bookName: string;
  }[];
  packagedStock: number;       // In parcel packaging (pre-packed sets)
  shelfStock: number;          // On shelf (open / loose copies)
  totalAvailableStock: number; // Total = shelfStock + packagedStock
  totalBatchesPacked: number;  // Total batches completed
  history: {
    batchId: string;
    quantity: number;
    booksScanned: string[];
    employeeId?: mongoose.Types.ObjectId;
    employeeName?: string;
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const PackagePreparationSchema = new Schema<IPackagePreparation>(
  {
    productCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    books: [
      {
        bookCode: { type: String, required: true, uppercase: true, trim: true },
        bookName: { type: String, default: '' },
      },
    ],
    packagedStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    shelfStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAvailableStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalBatchesPacked: {
      type: Number,
      default: 0,
    },
    history: [
      {
        batchId: { type: String, required: true },
        quantity: { type: Number, required: true },
        booksScanned: [{ type: String }],
        employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
        employeeName: { type: String, default: 'Warehouse Operator' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

PackagePreparationSchema.index({ productCode: 1, productName: 1 });

export const PackagePreparation = mongoose.model<IPackagePreparation>(
  'PackagePreparation',
  PackagePreparationSchema
);
