import mongoose, { Schema, Document } from 'mongoose';

export interface IProductCatalog extends Document {
  productCode: string;
  productName: string;
  books: string[];
  description?: string;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductCatalogSchema = new Schema<IProductCatalog>(
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
    books: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      trim: true,
      default: '',
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

export const ProductCatalog = mongoose.model<IProductCatalog>('ProductCatalog', ProductCatalogSchema);
