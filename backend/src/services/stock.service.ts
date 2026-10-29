import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { BookStock, IBookStock } from '../models/BookStock';
import { StockInward } from '../models/StockInward';
import { PendingBook } from '../models/PendingBook';
import { ProductCatalog } from '../models/ProductCatalog';
import { Order } from '../models/Order';
import { DispatchLog } from '../models/DispatchLog';
import { AuditLog } from '../models/AuditLog';
import { logAudit } from '../utils/audit';

export interface GetAvailableStockParams {
  search?: string;
  status?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AddInwardEntryInput {
  bookCode: string;
  bookName: string;
  quantity: number;
  supplier?: string;
  remarks?: string;
  source?: 'MANUAL' | 'EXCEL_UPLOAD' | 'BARCODE_SCAN';
  entryDate?: string;
  entryTime?: string;
}

/**
 * Normalizes book code consistently
 */
export function normalizeCode(code: string): string {
  return (code || '').trim().toUpperCase();
}

export async function addBookBarcode(userId: string, input: { bookCode: string; bookName: string; productCode?: string }) {
  if (
    typeof input.bookCode !== 'string' ||
    typeof input.bookName !== 'string' ||
    (input.productCode !== undefined && typeof input.productCode !== 'string')
  ) {
    throw { statusCode: 400, message: 'Book code, name, and product code must be text', code: 'INVALID_BOOK_DETAILS' };
  }
  const bookCode = normalizeCode(input.bookCode);
  const bookName = (input.bookName || '').trim();
  if (!bookCode || !bookName) {
    throw { statusCode: 400, message: 'Book code and book name are required', code: 'BOOK_DETAILS_REQUIRED' };
  }

  if (await BookStock.exists({ bookCode })) {
    throw { statusCode: 409, message: `Book code "${bookCode}" already exists`, code: 'BOOK_CODE_EXISTS' };
  }

  const book = await BookStock.create({
    bookCode,
    bookName,
    productCode: normalizeCode(input.productCode || ''),
    availableQuantity: 0,
    totalInward: 0,
    totalDispatched: 0,
  });

  await logAudit({
    actorUserId: userId,
    action: 'BOOK_BARCODE_CREATED',
    entityType: 'BookStock',
    entityId: book._id.toString(),
    metadata: { bookCode, bookName, productCode: book.productCode },
  });

  return { message: `Book barcode "${bookCode}" added successfully`, book };
}

export async function addProductBarcode(userId: string, input: { productCode: string; productName: string; books?: string[] }) {
  if (
    typeof input.productCode !== 'string' ||
    typeof input.productName !== 'string' ||
    (input.books !== undefined && (!Array.isArray(input.books) || input.books.some((book) => typeof book !== 'string')))
  ) {
    throw { statusCode: 400, message: 'Product details and included book codes must be text', code: 'INVALID_PRODUCT_DETAILS' };
  }
  const productCode = normalizeCode(input.productCode);
  const productName = (input.productName || '').trim();
  if (!productCode || !productName) {
    throw { statusCode: 400, message: 'Product code and product name are required', code: 'PRODUCT_DETAILS_REQUIRED' };
  }
  if (await ProductCatalog.exists({ productCode, productName })) {
    throw { statusCode: 409, message: `Product "${productName}" with code "${productCode}" already exists`, code: 'PRODUCT_EXISTS' };
  }

  const books = Array.from(new Set((input.books || []).map(normalizeCode).filter(Boolean)));
  const product = await ProductCatalog.create({ productCode, productName, books });

  await logAudit({
    actorUserId: userId,
    action: 'PRODUCT_BARCODE_CREATED',
    entityType: 'ProductCatalog',
    entityId: product._id.toString(),
    metadata: { productCode, productName, books },
  });

  return { message: `Product barcode "${productCode}" added successfully`, product };
}

export async function deleteProduct(userId: string, identifier: string) {
  const cleanId = identifier.trim();
  if (!mongoose.Types.ObjectId.isValid(cleanId)) {
    throw { statusCode: 400, message: 'A valid product record ID is required', code: 'INVALID_PRODUCT_ID' };
  }

  const product = await ProductCatalog.findById(cleanId);
  if (!product) {
    throw { statusCode: 404, message: 'Product record was not found', code: 'PRODUCT_NOT_FOUND' };
  }

  const orderCount = await Order.countDocuments({
    items: {
      $elemMatch: {
        productCode: product.productCode,
        productName: product.productName,
      },
    },
  });
  if (orderCount > 0) {
    throw {
      statusCode: 409,
      message: `This product is used by ${orderCount} order(s) and cannot be deleted. Historical order records are preserved.`,
      code: 'PRODUCT_IN_USE',
    };
  }

  const anotherProductWithCode = await ProductCatalog.exists({
    _id: { $ne: product._id },
    productCode: product.productCode,
  });
  if (!anotherProductWithCode) {
    await BookStock.updateMany(
      { productCode: product.productCode },
      { $unset: { productCode: '' } }
    );
  }

  const productCode = product.productCode;
  const productName = product.productName;
  const productId = product._id.toString();
  await ProductCatalog.findByIdAndDelete(product._id);

  await logAudit({
    actorUserId: userId,
    action: 'PRODUCT_DELETED',
    entityType: 'ProductCatalog',
    entityId: productId,
    metadata: { productCode, productName },
  });

  return {
    message: `Product "${productName}" (${productCode}) has been deleted.`,
    productCode,
    productName,
  };
}

/**
 * Get available warehouse stock with aggregate summary statistics
 */
export async function getAvailableStock(params: GetAvailableStockParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 20));
  const skip = (page - 1) * limit;

  const query: any = {};

  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    const regex = new RegExp(q, 'i');
    query.$or = [{ bookCode: regex }, { bookName: regex }, { productCode: regex }];
  }

  if (params.status === 'OUT_OF_STOCK') {
    query.availableQuantity = { $lte: 0 };
  } else if (params.status === 'LOW_STOCK') {
    query.availableQuantity = { $gt: 0, $lte: 10 };
  } else if (params.status === 'IN_STOCK') {
    query.availableQuantity = { $gt: 10 };
  }

  const sortDirection = params.sortOrder === 'asc' ? 1 : -1;
  const sortField = params.sortBy || 'availableQuantity';
  const sort: any = { [sortField]: sortDirection };

  const [books, totalMatching, summaryAgg] = await Promise.all([
    BookStock.find(query).sort(sort).skip(skip).limit(limit).lean(),
    BookStock.countDocuments(query),
    BookStock.aggregate([
      {
        $group: {
          _id: null,
          totalTitles: { $sum: 1 },
          totalAvailableCopies: { $sum: '$availableQuantity' },
          totalInwardCopies: { $sum: '$totalInward' },
          totalDispatchedCopies: { $sum: '$totalDispatched' },
          outOfStockTitles: {
            $sum: { $cond: [{ $lte: ['$availableQuantity', 0] }, 1, 0] },
          },
          lowStockTitles: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ['$availableQuantity', 0] },
                    { $lte: ['$availableQuantity', '$lowStockThreshold'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          inStockTitles: {
            $sum: {
              $cond: [{ $gt: ['$availableQuantity', '$lowStockThreshold'] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  const summary = summaryAgg[0] || {
    totalTitles: 0,
    totalAvailableCopies: 0,
    totalInwardCopies: 0,
    totalDispatchedCopies: 0,
    outOfStockTitles: 0,
    lowStockTitles: 0,
    inStockTitles: 0,
  };

  const formattedBooks = books.map((b: any) => {
    let stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK';
    if (b.availableQuantity <= 0) {
      stockStatus = 'OUT_OF_STOCK';
    } else if (b.availableQuantity <= (b.lowStockThreshold || 10)) {
      stockStatus = 'LOW_STOCK';
    }

    return {
      id: b._id.toString(),
      bookCode: b.bookCode,
      bookName: b.bookName,
      productCode: b.productCode,
      totalInward: b.totalInward,
      totalDispatched: b.totalDispatched,
      availableQuantity: b.availableQuantity,
      lowStockThreshold: b.lowStockThreshold || 10,
      stockStatus,
      lastRestockedAt: b.lastRestockedAt,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  });

  return {
    books: formattedBooks,
    pagination: {
      page,
      limit,
      total: totalMatching,
      totalPages: Math.ceil(totalMatching / limit),
    },
    summary,
  };
}

/**
 * Add a daily inward stock entry and update available stock
 */
export async function addInwardEntry(userId: string, input: AddInwardEntryInput) {
  const cleanCode = normalizeCode(input.bookCode);
  const cleanName = (input.bookName || '').trim();
  const quantity = Math.floor(Number(input.quantity));

  if (!cleanCode) {
    throw { statusCode: 400, message: 'Book Code is required', code: 'BOOK_CODE_REQUIRED' };
  }
  if (!cleanName) {
    throw { statusCode: 400, message: 'Book Name is required', code: 'BOOK_NAME_REQUIRED' };
  }
  if (!quantity || quantity <= 0) {
    throw { statusCode: 400, message: 'Quantity must be at least 1', code: 'INVALID_QUANTITY' };
  }

  const now = new Date();
  const entryDate = input.entryDate ? new Date(input.entryDate) : now;
  const entryTime = input.entryTime || now.toLocaleTimeString('en-IN', { hour12: false });

  // 1. Record inward transaction log with date and timing
  const inwardRecord = await StockInward.create({
    entryDate,
    entryTime,
    bookCode: cleanCode,
    bookName: cleanName,
    quantity,
    supplier: (input.supplier || '').trim(),
    remarks: (input.remarks || '').trim(),
    source: input.source || 'MANUAL',
    enteredByUserId: new mongoose.Types.ObjectId(userId),
  });

  // 2. Increment live warehouse stock in BookStock master
  const updatedStock = await BookStock.findOneAndUpdate(
    { bookCode: cleanCode },
    {
      $setOnInsert: {
        bookCode: cleanCode,
        totalDispatched: 0,
      },
      $set: {
        bookName: cleanName,
        lastRestockedAt: now,
      },
      $inc: {
        availableQuantity: quantity,
        totalInward: quantity,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // 3. Log audit event
  await logAudit({
    actorUserId: userId,
    action: 'STOCK_INWARD_ADDED',
    entityType: 'StockInward',
    entityId: inwardRecord._id.toString(),
    metadata: {
      bookCode: cleanCode,
      bookName: cleanName,
      quantity,
      newAvailableQuantity: updatedStock.availableQuantity,
    },
  });

  return {
    inwardRecord,
    updatedStock: {
      bookCode: updatedStock.bookCode,
      bookName: updatedStock.bookName,
      availableQuantity: updatedStock.availableQuantity,
      totalInward: updatedStock.totalInward,
      totalDispatched: updatedStock.totalDispatched,
    },
  };
}

/**
 * Bulk Inward Stock via Excel Upload
 */
export async function bulkInwardExcel(userId: string, buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw { statusCode: 400, message: 'Excel file is empty', code: 'EMPTY_FILE' };
  }

  const rows: any[] = [];
  const headerMap = new Map<string, number>();

  // Detect header row
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const val = (cell.text || cell.value?.toString() || '').trim().toLowerCase().replace(/[\s\-_]/g, '');
    headerMap.set(val, colNumber);
  });

  const getColVal = (row: any, ...aliases: string[]) => {
    for (const a of aliases) {
      const col = headerMap.get(a.toLowerCase().replace(/[\s\-_]/g, ''));
      if (col) {
        const c = row.getCell(col);
        return (c.text || c.value?.toString() || '').trim();
      }
    }
    return '';
  };

  const validEntries: AddInwardEntryInput[] = [];
  const errors: { row: number; error: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip headers

    const bookCode = getColVal(row, 'bookcode', 'code', 'book_code', 'barcode');
    const bookName = getColVal(row, 'bookname', 'name', 'title', 'book_name');
    const rawQty = getColVal(row, 'quantity', 'qty', 'count');
    const supplier = getColVal(row, 'supplier', 'source', 'vendor', 'printer');
    const remarks = getColVal(row, 'remarks', 'notes', 'invoice', 'challan');

    if (!bookCode && !bookName && !rawQty) {
      return; // Skip empty row
    }

    const qty = parseInt(rawQty, 10);
    if (!bookCode) {
      errors.push({ row: rowNumber, error: 'Book Code is required' });
      return;
    }
    if (!bookName) {
      errors.push({ row: rowNumber, error: 'Book Name is required' });
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      errors.push({ row: rowNumber, error: 'Quantity must be a positive number' });
      return;
    }

    validEntries.push({
      bookCode,
      bookName,
      quantity: qty,
      supplier,
      remarks,
      source: 'EXCEL_UPLOAD',
    });
  });

  if (validEntries.length === 0) {
    throw {
      statusCode: 400,
      message: 'No valid rows found in Excel sheet. Please check column headers (Book Code, Book Name, Quantity).',
      code: 'NO_VALID_ROWS',
      errors,
    };
  }

  let totalImportedCopies = 0;
  const processedRecords = [];

  for (const item of validEntries) {
    const res = await addInwardEntry(userId, item);
    processedRecords.push(res.inwardRecord);
    totalImportedCopies += item.quantity;
  }

  await logAudit({
    actorUserId: userId,
    action: 'STOCK_BULK_EXCEL_IMPORTED',
    entityType: 'StockInward',
    entityId: 'BULK',
    metadata: {
      validEntriesCount: validEntries.length,
      totalImportedCopies,
      errorCount: errors.length,
    },
  });

  return {
    success: true,
    importedEntries: validEntries.length,
    totalImportedCopies,
    errors,
  };
}

/**
 * Get daily inward logs with date and timing filters
 */
export async function getInwardHistory(params: {
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 20));
  const skip = (page - 1) * limit;

  const query: any = {};

  if (params.search && params.search.trim()) {
    const regex = new RegExp(params.search.trim(), 'i');
    query.$or = [{ bookCode: regex }, { bookName: regex }, { supplier: regex }, { remarks: regex }];
  }

  if (params.startDate || params.endDate) {
    query.entryDate = {};
    if (params.startDate) {
      query.entryDate.$gte = new Date(params.startDate);
    }
    if (params.endDate) {
      const end = new Date(params.endDate);
      end.setHours(23, 59, 59, 999);
      query.entryDate.$lte = end;
    }
  }

  const [records, total] = await Promise.all([
    StockInward.find(query)
      .populate('enteredByUserId', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockInward.countDocuments(query),
  ]);

  return {
    records: records.map((r: any) => ({
      id: r._id.toString(),
      entryDate: r.entryDate,
      entryTime: r.entryTime,
      bookCode: r.bookCode,
      bookName: r.bookName,
      quantity: r.quantity,
      supplier: r.supplier,
      remarks: r.remarks,
      source: r.source,
      enteredBy: r.enteredByUserId
        ? {
            id: r.enteredByUserId._id?.toString(),
            name: r.enteredByUserId.name,
            email: r.enteredByUserId.email,
          }
        : null,
      createdAt: r.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Delete mistakenly added inward entry and revert stock count
 */
export async function deleteInwardEntry(userId: string, inwardId: string) {
  const entry = await StockInward.findById(inwardId);
  if (!entry) {
    throw { statusCode: 404, message: 'Inward entry not found', code: 'NOT_FOUND' };
  }

  // Deduct from BookStock
  const stock = await BookStock.findOne({ bookCode: entry.bookCode });
  if (stock) {
    stock.availableQuantity -= entry.quantity;
    stock.totalInward = Math.max(0, stock.totalInward - entry.quantity);
    await stock.save();
  }

  await StockInward.findByIdAndDelete(inwardId);

  await logAudit({
    actorUserId: userId,
    action: 'STOCK_INWARD_DELETED',
    entityType: 'StockInward',
    entityId: inwardId,
    metadata: {
      bookCode: entry.bookCode,
      bookName: entry.bookName,
      quantityReverted: entry.quantity,
    },
  });

  return { message: 'Inward entry deleted and available stock adjusted successfully' };
}

/**
 * Search existing book catalog across BookStock and Orders for quick autocomplete
 */
export async function searchBookCatalog(q: string) {
  if (!q || !q.trim()) return [];
  const regex = new RegExp(q.trim(), 'i');

  const stockMatches = await BookStock.find({
    $or: [{ bookCode: regex }, { bookName: regex }],
  })
    .limit(10)
    .lean();

  if (stockMatches.length > 0) {
    return stockMatches.map((b) => ({
      bookCode: b.bookCode,
      bookName: b.bookName,
      availableQuantity: b.availableQuantity,
    }));
  }

  // Fallback to order items if not yet registered in BookStock
  const orderMatches = await Order.aggregate([
    { $unwind: '$items' },
    {
      $match: {
        $or: [{ 'items.bookCode': regex }, { 'items.bookName': regex }],
      },
    },
    {
      $group: {
        _id: '$items.bookCode',
        bookCode: { $first: '$items.bookCode' },
        bookName: { $first: '$items.bookName' },
      },
    },
    { $limit: 10 },
  ]);

  return orderMatches.map((m) => ({
    bookCode: m.bookCode,
    bookName: m.bookName,
    availableQuantity: 0,
  }));
}

/**
 * Export Available Stock Master to Excel
 */
export async function exportStockExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Available Stock Master');

  sheet.columns = [
    { header: 'Book Code / Barcode', key: 'bookCode', width: 20 },
    { header: 'Book Name', key: 'bookName', width: 35 },
    { header: 'Total Inward', key: 'totalInward', width: 15 },
    { header: 'Total Dispatched', key: 'totalDispatched', width: 16 },
    { header: 'Available Stock', key: 'availableQuantity', width: 16 },
    { header: 'Stock Status', key: 'stockStatus', width: 16 },
    { header: 'Last Restocked Date & Time', key: 'lastRestockedAt', width: 26 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' },
  };

  const stocks = await BookStock.find().sort({ availableQuantity: 1 }).lean();

  stocks.forEach((s) => {
    let status = 'In Stock';
    if (s.availableQuantity <= 0) status = 'Out of Stock';
    else if (s.availableQuantity <= (s.lowStockThreshold || 10)) status = 'Low Stock';

    sheet.addRow({
      bookCode: s.bookCode,
      bookName: s.bookName,
      totalInward: s.totalInward,
      totalDispatched: s.totalDispatched,
      availableQuantity: s.availableQuantity,
      stockStatus: status,
      lastRestockedAt: s.lastRestockedAt ? new Date(s.lastRestockedAt).toLocaleString('en-IN') : 'N/A',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Export Inward History to Excel
 */
export async function exportInwardExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inward Stock History');

  sheet.columns = [
    { header: 'Entry Date', key: 'entryDate', width: 16 },
    { header: 'Entry Timing', key: 'entryTime', width: 16 },
    { header: 'Book Code', key: 'bookCode', width: 20 },
    { header: 'Book Name', key: 'bookName', width: 35 },
    { header: 'Quantity Inwarded', key: 'quantity', width: 18 },
    { header: 'Supplier / Source', key: 'supplier', width: 22 },
    { header: 'Remarks / Invoice', key: 'remarks', width: 25 },
    { header: 'Entered By', key: 'enteredBy', width: 22 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  };

  const records = await StockInward.find()
    .populate('enteredByUserId', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  records.forEach((r: any) => {
    sheet.addRow({
      entryDate: r.entryDate ? new Date(r.entryDate).toLocaleDateString('en-IN') : '',
      entryTime: r.entryTime || '',
      bookCode: r.bookCode,
      bookName: r.bookName,
      quantity: r.quantity,
      supplier: r.supplier || '-',
      remarks: r.remarks || '-',
      enteredBy: r.enteredByUserId?.name || 'System',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Clear all stock master and inward history (Admin reset)
 */
export async function clearAllStock(userId: string) {
  const stockRes = await BookStock.deleteMany({});
  const inwardRes = await StockInward.deleteMany({});

  await logAudit({
    actorUserId: userId,
    action: 'ALL_STOCK_CLEARED',
    entityType: 'BookStock',
    entityId: 'ALL',
    metadata: {
      stocksDeleted: stockRes.deletedCount,
      inwardsDeleted: inwardRes.deletedCount,
    },
  });

  return {
    message: 'All stock and inward records have been cleared successfully.',
    stocksDeleted: stockRes.deletedCount,
    inwardsDeleted: inwardRes.deletedCount,
  };
}

/**
 * Delete a single book from stock master
 */
export async function deleteBookStock(userId: string, identifier: string) {
  const cleanId = identifier.trim();
  let book = null;

  if (mongoose.Types.ObjectId.isValid(cleanId)) {
    book = await BookStock.findById(cleanId);
  }
  if (!book) {
    const cleanCode = normalizeCode(cleanId);
    book = await BookStock.findOne({ bookCode: cleanCode });
  }

  if (!book) {
    throw { statusCode: 404, message: `Book "${identifier}" not found in stock master`, code: 'BOOK_NOT_FOUND' };
  }

  // Preserve negative balances until they are reconciled with inward stock.
  if (book.availableQuantity !== 0) {
    throw {
      statusCode: 400,
      message: `Book record can only be deleted when its stock balance is 0. Current balance is ${book.availableQuantity}; reconcile any negative balance before deleting.`,
      code: 'CANNOT_DELETE_ACTIVE_STOCK',
    };
  }

  const bookName = book.bookName;
  const bookCode = book.bookCode;
  const stockId = book._id.toString();

  await BookStock.findByIdAndDelete(book._id);
  await ProductCatalog.updateMany(
    { books: bookCode },
    { $pull: { books: bookCode } }
  );

  await logAudit({
    actorUserId: userId,
    action: 'BOOK_STOCK_DELETED',
    entityType: 'BookStock',
    entityId: stockId,
    metadata: {
      bookCode,
      bookName,
    },
  });

  return {
    message: `Book "${bookName}" (${bookCode}) has been successfully deleted from available stock.`,
    bookCode,
    bookName,
  };
}

/**
 * Update Book details in stock master (Book Code, Book Name, Product Code, Low Stock Threshold, Available Stock)
 */
export async function updateBookDetails(
  userId: string,
  identifier: string,
  updateData: {
    bookCode?: string;
    bookName?: string;
    productCode?: string;
    lowStockThreshold?: number;
    availableQuantity?: number;
  }
) {
  const cleanId = identifier.trim();
  let book = null;

  if (mongoose.Types.ObjectId.isValid(cleanId)) {
    book = await BookStock.findById(cleanId);
  }
  if (!book) {
    const cleanCode = normalizeCode(cleanId);
    book = await BookStock.findOne({ bookCode: cleanCode });
  }

  if (!book) {
    throw { statusCode: 404, message: `Book "${identifier}" not found in stock master`, code: 'BOOK_NOT_FOUND' };
  }

  const oldCode = book.bookCode;
  const oldName = book.bookName;
  const oldProductCode = book.productCode || '';
  const oldThreshold = book.lowStockThreshold || 10;
  const oldAvailable = book.availableQuantity;

  let newCode = oldCode;
  if (updateData.bookCode && updateData.bookCode.trim()) {
    newCode = normalizeCode(updateData.bookCode);
    if (newCode !== oldCode) {
      // Check if newCode already belongs to another book
      const existing = await BookStock.findOne({ bookCode: newCode });
      if (existing && existing._id.toString() !== book._id.toString()) {
        throw {
          statusCode: 400,
          message: `Book code "${newCode}" already exists for another book (${existing.bookName})! Duplicate code not allowed.`,
          code: 'DUPLICATE_BOOK_CODE',
        };
      }
    }
  }

  const newName = updateData.bookName && updateData.bookName.trim() ? updateData.bookName.trim() : oldName;
  const newProductCode = updateData.productCode !== undefined ? updateData.productCode.trim().toUpperCase() : oldProductCode;
  const newThreshold =
    updateData.lowStockThreshold !== undefined && Number(updateData.lowStockThreshold) > 0
      ? Number(updateData.lowStockThreshold)
      : oldThreshold;

  book.bookCode = newCode;
  book.bookName = newName;
  book.productCode = newProductCode;
  book.lowStockThreshold = newThreshold;

  // If availableQuantity is also updated
  if (
    updateData.availableQuantity !== undefined &&
    !isNaN(Number(updateData.availableQuantity)) &&
    Number(updateData.availableQuantity) >= 0
  ) {
    const newQty = Number(updateData.availableQuantity);
    book.availableQuantity = newQty;
    // Align totalInward if needed so totalInward >= totalDispatched + availableQuantity
    if (book.totalInward < book.totalDispatched + newQty) {
      book.totalInward = book.totalDispatched + newQty;
    }
  }

  await book.save();

  // If bookCode or bookName changed, also sync across StockInward and PendingBook so records match
  if (newCode !== oldCode || newName !== oldName) {
    await StockInward.updateMany(
      { bookCode: oldCode },
      { $set: { bookCode: newCode, bookName: newName } }
    );
    await PendingBook.updateMany(
      { bookCode: oldCode },
      { $set: { bookCode: newCode, bookName: newName } }
    );
  }

  await logAudit({
    actorUserId: userId,
    action: 'BOOK_STOCK_UPDATED',
    entityType: 'BookStock',
    entityId: book._id.toString(),
    metadata: {
      old: { bookCode: oldCode, bookName: oldName, productCode: oldProductCode, lowStockThreshold: oldThreshold, availableQuantity: oldAvailable },
      new: { bookCode: newCode, bookName: newName, productCode: newProductCode, lowStockThreshold: newThreshold, availableQuantity: book.availableQuantity },
    },
  });

  return {
    message: `Book "${newName}" (${newCode}) ki details successfully update ho gayi hain!`,
    book,
  };
}

export interface AdjustStockInput {
  bookCode: string;
  bookName?: string;
  mode: 'SET' | 'ADD' | 'REDUCE';
  quantity: number;
  reason?: string;
  lowStockThreshold?: number;
}

/**
 * Update, increase, or reduce stock for a book
 */
export async function adjustStock(userId: string, input: AdjustStockInput) {
  const cleanCode = normalizeCode(input.bookCode);
  const stock = await BookStock.findOne({ bookCode: cleanCode });
  if (!stock) {
    throw { statusCode: 404, message: `Book with code "${cleanCode}" not found in stock master`, code: 'BOOK_NOT_FOUND' };
  }

  const oldAvailable = stock.availableQuantity;
  let newAvailable = oldAvailable;
  const qty = Math.max(0, Math.floor(input.quantity ?? 0));

  if (input.mode === 'SET') {
    newAvailable = qty;
  } else if (input.mode === 'ADD') {
    newAvailable = oldAvailable + qty;
  } else if (input.mode === 'REDUCE') {
    if (qty > oldAvailable) {
      throw { statusCode: 400, message: `Cannot reduce ${qty} copies: only ${oldAvailable} available in warehouse!`, code: 'INSUFFICIENT_STOCK' };
    }
    newAvailable = oldAvailable - qty;
  } else {
    throw { statusCode: 400, message: 'Invalid mode. Mode must be SET, ADD, or REDUCE', code: 'INVALID_MODE' };
  }

  const diff = newAvailable - oldAvailable;

  stock.availableQuantity = newAvailable;
  stock.totalInward = Math.max(0, stock.totalDispatched + newAvailable);
  if (input.bookName && input.bookName.trim()) {
    stock.bookName = input.bookName.trim();
  }
  if (input.lowStockThreshold && input.lowStockThreshold >= 1) {
    stock.lowStockThreshold = input.lowStockThreshold;
  }
  stock.lastRestockedAt = new Date();
  await stock.save();

  // Log in StockInward for record keeping
  const now = new Date();
  const entryDate = now.toISOString().slice(0, 10);
  const entryTime = now.toLocaleTimeString('en-IN', { hour12: false });

  await StockInward.create({
    bookCode: cleanCode,
    bookName: stock.bookName,
    quantity: diff !== 0 ? diff : 0,
    supplier: diff < 0 ? 'Stock Reduction (स्टॉक कटौती)' : 'Stock Adjustment (स्टॉक समायोजन)',
    remarks: input.reason || (input.mode === 'REDUCE' ? `Reduced by ${qty} copies` : input.mode === 'SET' ? `Stock set directly to ${newAvailable}` : `Added ${qty} copies`),
    entryDate: now,
    entryTime,
    enteredByUserId: new mongoose.Types.ObjectId(userId),
    source: 'MANUAL',
  });

  await logAudit({
    actorUserId: userId,
    action: 'STOCK_ADJUSTED',
    entityType: 'BookStock',
    entityId: stock._id.toString(),
    metadata: {
      bookCode: cleanCode,
      mode: input.mode,
      oldQuantity: oldAvailable,
      newQuantity: newAvailable,
      diff,
      reason: input.reason,
    },
  });

  return {
    message: `Stock for "${stock.bookName}" (${cleanCode}) updated successfully from ${oldAvailable} to ${newAvailable} copies.`,
    book: {
      id: stock._id.toString(),
      bookCode: stock.bookCode,
      bookName: stock.bookName,
      availableQuantity: stock.availableQuantity,
      totalInward: stock.totalInward,
      totalDispatched: stock.totalDispatched,
      lowStockThreshold: stock.lowStockThreshold,
      stockStatus: stock.availableQuantity <= 0 ? 'OUT_OF_STOCK' : stock.availableQuantity <= stock.lowStockThreshold ? 'LOW_STOCK' : 'IN_STOCK',
      lastRestockedAt: stock.lastRestockedAt,
    },
  };
}

/* =========================================================================
   PENDING BOOKS MANAGEMENT (पेंडिंग बुक स्टॉक)
========================================================================= */

export interface GetPendingBooksParams {
  search?: string;
  status?: 'ALL' | 'PENDING' | 'RECEIVED' | 'CANCELLED';
  priority?: 'ALL' | 'NORMAL' | 'HIGH' | 'URGENT';
  page?: number;
  limit?: number;
}

export interface AddPendingBookInput {
  bookCode: string;
  bookName: string;
  pendingQuantity: number;
  printerOrVendor?: string;
  expectedDate?: string | Date;
  priority?: 'NORMAL' | 'HIGH' | 'URGENT';
  remarks?: string;
}

export async function getPendingBooks(params: GetPendingBooksParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 20));
  const skip = (page - 1) * limit;

  const query: any = {};
  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    const regex = new RegExp(q, 'i');
    query.$or = [{ bookCode: regex }, { bookName: regex }, { printerOrVendor: regex }];
  }

  if (params.status && params.status !== 'ALL') {
    query.status = params.status;
  }
  if (params.priority && params.priority !== 'ALL') {
    query.priority = params.priority;
  }

  const [items, total, summaryAgg] = await Promise.all([
    PendingBook.find(query)
      .populate('addedByUserId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PendingBook.countDocuments(query),
    PendingBook.aggregate([
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          totalPendingCopies: {
            $sum: {
              $cond: [{ $eq: ['$status', 'PENDING'] }, '$pendingQuantity', 0],
            },
          },
          totalReceivedCopies: {
            $sum: '$receivedQuantity',
          },
          urgentCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'PENDING'] },
                    { $in: ['$priority', ['HIGH', 'URGENT']] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const summary = summaryAgg[0] || {
    totalEntries: 0,
    totalPendingCopies: 0,
    totalReceivedCopies: 0,
    urgentCount: 0,
  };

  return {
    items: items.map((item: any) => ({
      id: item._id.toString(),
      bookCode: item.bookCode,
      bookName: item.bookName,
      pendingQuantity: item.pendingQuantity,
      receivedQuantity: item.receivedQuantity || 0,
      printerOrVendor: item.printerOrVendor || '-',
      expectedDate: item.expectedDate,
      priority: item.priority || 'NORMAL',
      status: item.status || 'PENDING',
      remarks: item.remarks || '',
      addedBy: item.addedByUserId ? { name: item.addedByUserId.name, email: item.addedByUserId.email } : null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function addPendingBook(userId: string, input: AddPendingBookInput) {
  const cleanCode = normalizeCode(input.bookCode);
  const cleanName = (input.bookName || '').trim();
  const qty = parseInt(String(input.pendingQuantity), 10);

  if (!cleanCode) {
    throw { statusCode: 400, message: 'Book Code / Barcode is required', code: 'BOOK_CODE_REQUIRED' };
  }
  if (!cleanName) {
    throw { statusCode: 400, message: 'Book Name is required', code: 'BOOK_NAME_REQUIRED' };
  }
  if (isNaN(qty) || qty <= 0) {
    throw { statusCode: 400, message: 'Pending Quantity must be at least 1', code: 'INVALID_QUANTITY' };
  }

  const pendingBook = await PendingBook.create({
    bookCode: cleanCode,
    bookName: cleanName,
    pendingQuantity: qty,
    receivedQuantity: 0,
    printerOrVendor: (input.printerOrVendor || '').trim(),
    expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
    priority: input.priority || 'NORMAL',
    status: 'PENDING',
    remarks: (input.remarks || '').trim(),
    addedByUserId: new mongoose.Types.ObjectId(userId),
  });

  await logAudit({
    actorUserId: userId,
    action: 'PENDING_BOOK_ADDED',
    entityType: 'PendingBook',
    entityId: pendingBook._id.toString(),
    metadata: {
      bookCode: cleanCode,
      bookName: cleanName,
      pendingQuantity: qty,
      printerOrVendor: pendingBook.printerOrVendor,
    },
  });

  return {
    message: `Pending entry for "${cleanName}" (${cleanCode}) created successfully!`,
    pendingBook,
  };
}

export async function updatePendingBook(userId: string, id: string, input: Partial<AddPendingBookInput & { status: string }>) {
  const pendingBook = await PendingBook.findById(id);
  if (!pendingBook) {
    throw { statusCode: 404, message: 'Pending book record not found', code: 'NOT_FOUND' };
  }

  if (input.bookCode) pendingBook.bookCode = normalizeCode(input.bookCode);
  if (input.bookName) pendingBook.bookName = input.bookName.trim();
  if (input.pendingQuantity !== undefined) {
    const qty = parseInt(String(input.pendingQuantity), 10);
    if (!isNaN(qty) && qty > 0) pendingBook.pendingQuantity = qty;
  }
  if (input.printerOrVendor !== undefined) pendingBook.printerOrVendor = input.printerOrVendor.trim();
  if (input.expectedDate !== undefined) pendingBook.expectedDate = input.expectedDate ? new Date(input.expectedDate) : undefined;
  if (input.priority) pendingBook.priority = input.priority as any;
  if (input.status) pendingBook.status = input.status as any;
  if (input.remarks !== undefined) pendingBook.remarks = input.remarks.trim();

  await pendingBook.save();

  return {
    message: `Pending book record updated successfully!`,
    pendingBook,
  };
}

export async function deletePendingBook(userId: string, id: string) {
  const pendingBook = await PendingBook.findById(id);
  if (!pendingBook) {
    throw { statusCode: 404, message: 'Pending book record not found', code: 'NOT_FOUND' };
  }

  await PendingBook.findByIdAndDelete(id);

  await logAudit({
    actorUserId: userId,
    action: 'PENDING_BOOK_DELETED',
    entityType: 'PendingBook',
    entityId: id,
    metadata: {
      bookCode: pendingBook.bookCode,
      bookName: pendingBook.bookName,
    },
  });

  return {
    message: `Pending book record for "${pendingBook.bookName}" deleted successfully!`,
  };
}

export async function receivePendingBook(userId: string, id: string, input: { receivedQuantity?: number; remarks?: string }) {
  const pendingBook = await PendingBook.findById(id);
  if (!pendingBook) {
    throw { statusCode: 404, message: 'Pending book record not found', code: 'NOT_FOUND' };
  }

  const qty = input.receivedQuantity && input.receivedQuantity > 0 ? input.receivedQuantity : pendingBook.pendingQuantity;

  // 1. Add to live warehouse Stock Inward
  await addInwardEntry(userId, {
    bookCode: pendingBook.bookCode,
    bookName: pendingBook.bookName,
    quantity: qty,
    supplier: pendingBook.printerOrVendor || 'Pending Order Arrival',
    remarks: input.remarks || `Received from Pending Book Order (${qty} copies arrived)`,
    source: 'MANUAL',
  });

  // 2. Mark pending record as received
  pendingBook.receivedQuantity = (pendingBook.receivedQuantity || 0) + qty;
  pendingBook.status = 'RECEIVED';
  await pendingBook.save();

  await logAudit({
    actorUserId: userId,
    action: 'PENDING_BOOK_RECEIVED_TO_STOCK',
    entityType: 'PendingBook',
    entityId: id,
    metadata: {
      bookCode: pendingBook.bookCode,
      bookName: pendingBook.bookName,
      receivedQuantity: qty,
    },
  });

    return {
      message: `${qty} copies of "${pendingBook.bookName}" received and added to Available Warehouse Stock!`,
      pendingBook,
    };
  }

  /**
   * Get comprehensive Barcode Directory for all Books and Products
   */
  export async function getBarcodeCatalog() {
    // 1. All Books in BookStock
    const booksStock = await BookStock.find({}).sort({ bookCode: 1 }).lean();

    // Pending books count map
    const pendingRecords = await PendingBook.find({ status: { $ne: 'RECEIVED' } }).lean();
    const pendingMap = new Map<string, number>();
    pendingRecords.forEach((pb) => {
      const code = (pb.bookCode || '').toUpperCase().trim();
      const remaining = Math.max(0, (pb.pendingQuantity || 0) - (pb.receivedQuantity || 0));
      pendingMap.set(code, (pendingMap.get(code) || 0) + remaining);
    });

    const booksList = booksStock.map((b) => ({
      id: b._id.toString(),
      bookCode: b.bookCode,
      bookName: b.bookName,
      productCode: b.productCode || '',
      availableQuantity: b.availableQuantity,
      totalInward: b.totalInward,
      totalDispatched: b.totalDispatched,
      pendingQuantity: pendingMap.get(b.bookCode.toUpperCase()) || 0,
      type: 'BOOK' as const,
    }));

    // 2. Query ProductCatalog first
    let catalogProducts = await ProductCatalog.find({}).sort({ productCode: 1 }).lean();

    // 3. Aggregate products from Orders
    const productAgg = await Order.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            productCode: '$items.productCode',
            productName: '$items.productName',
          },
          books: { $addToSet: '$items.bookCode' },
          totalOrdersCount: { $sum: 1 },
        },
      },
      { $sort: { '_id.productCode': 1, '_id.productName': 1 } },
    ]);

    const productKey = (code: string, name: string) =>
      `${code.toUpperCase().trim()}\u0000${name.trim().toLowerCase()}`;
    const orderCountMap = new Map<string, number>();
    productAgg.forEach((p) => {
      const code = (p._id.productCode || '').toUpperCase().trim();
      const name = (p._id.productName || code).trim();
      if (code) {
        const key = productKey(code, name);
        orderCountMap.set(key, (orderCountMap.get(key) || 0) + (p.totalOrdersCount || 0));
      }
    });

    // Seed catalog entries by both code and name so same-code products stay separate.
    if (catalogProducts.length === 0) {
      const seedMap = new Map<string, { code: string; name: string; books: Set<string> }>();
      productAgg.forEach((p) => {
        const c = (p._id.productCode || '').toUpperCase().trim();
        const name = (p._id.productName || c).trim();
        if (c) {
          const key = productKey(c, name);
          if (!seedMap.has(key)) seedMap.set(key, { code: c, name, books: new Set() });
          (p.books || []).forEach((book: string) => seedMap.get(key)!.books.add(book.toUpperCase().trim()));
        }
      });
      booksStock.forEach((b) => {
        const pCode = (b.productCode || '').toUpperCase().trim();
        const hasCatalogProduct = Array.from(seedMap.values()).some((item) => item.code === pCode);
        const key = productKey(pCode, `${pCode} Course Bundle`);
        if (pCode && !hasCatalogProduct) {
          if (!seedMap.has(key)) {
            seedMap.set(key, { code: pCode, name: `${pCode} Course Bundle`, books: new Set() });
          }
          seedMap.get(key)!.books.add(b.bookCode.toUpperCase().trim());
        }
      });

      if (seedMap.size > 0) {
        const docs = Array.from(seedMap.values()).map((it) => ({
          productCode: it.code,
          productName: it.name,
          books: Array.from(it.books).sort(),
        }));
        await ProductCatalog.insertMany(docs, { ordered: false }).catch(() => {});
        catalogProducts = await ProductCatalog.find({}).sort({ productCode: 1 }).lean();
      }
    }

    // Add only missing code/name identities. Do not merge catalog products by code.
    const knownProducts = new Set(catalogProducts.map((p) => productKey(p.productCode, p.productName)));
    const missingDocs: any[] = [];
    const orderProducts = new Map<string, { code: string; name: string; books: Set<string> }>();
    productAgg.forEach((p) => {
      const c = (p._id.productCode || '').toUpperCase().trim();
      const name = (p._id.productName || c).trim();
      const key = productKey(c, name);
      if (c) {
        if (!orderProducts.has(key)) orderProducts.set(key, { code: c, name, books: new Set() });
        (p.books || []).forEach((book: string) => orderProducts.get(key)!.books.add(book.toUpperCase().trim()));
      }
    });
    orderProducts.forEach((product, key) => {
      if (!knownProducts.has(key)) {
        knownProducts.add(key);
        missingDocs.push({
          productCode: product.code,
          productName: product.name,
          books: Array.from(product.books).sort(),
        });
      }
    });
    const stockOnlyProducts = new Map<string, Set<string>>();
    booksStock.forEach((b) => {
      const pCode = (b.productCode || '').toUpperCase().trim();
      const hasCode = catalogProducts.some((product) => product.productCode.toUpperCase().trim() === pCode);
      if (pCode && !hasCode) {
        if (!stockOnlyProducts.has(pCode)) stockOnlyProducts.set(pCode, new Set());
        stockOnlyProducts.get(pCode)!.add(b.bookCode.toUpperCase().trim());
      }
    });
    stockOnlyProducts.forEach((books, pCode) => {
      const name = `${pCode} Course Bundle`;
      const key = productKey(pCode, name);
      if (!knownProducts.has(key)) {
        knownProducts.add(key);
        missingDocs.push({ productCode: pCode, productName: name, books: Array.from(books).sort() });
      }
    });

    if (missingDocs.length > 0) {
      await ProductCatalog.insertMany(missingDocs, { ordered: false }).catch(() => {});
      catalogProducts = await ProductCatalog.find({}).sort({ productCode: 1 }).lean();
    }

    // Keep each product's explicitly configured bundle isolated from same-code records.
    const productsList = catalogProducts.map((p) => {
      const c = p.productCode.toUpperCase().trim();
      const name = p.productName || c;
      const books = Array.from(new Set((p.books || []).map((book) => book.toUpperCase().trim()))).sort();

      return {
        id: p._id.toString(),
        productCode: c,
        productName: name,
        books,
        totalBooksCount: books.length,
        totalOrdersCount: orderCountMap.get(productKey(c, name)) || 0,
        type: 'PRODUCT' as const,
      };
    });

    return {
      books: booksList,
      products: productsList,
      summary: {
        totalBooks: booksList.length,
        totalProducts: productsList.length,
        totalInStockBooks: booksList.filter((b) => b.availableQuantity > 0).length,
        totalOutOfStockBooks: booksList.filter((b) => b.availableQuantity <= 0).length,
      },
    };
  }

  /**
   * Update Product details (Product Code, Course Name, Books Bundle)
   */
  export async function updateProductDetails(
    userId: string,
    identifier: string,
    updateData: {
      productCode?: string;
      productName?: string;
      books?: string[];
    }
  ) {
    const cleanId = identifier.trim().toUpperCase();
    const isRecordId = mongoose.Types.ObjectId.isValid(identifier);
    let product = isRecordId
      ? await ProductCatalog.findById(identifier)
      : await ProductCatalog.findOne({ productCode: cleanId });

    if (isRecordId && !product) {
      throw { statusCode: 404, message: 'Product record was not found', code: 'PRODUCT_NOT_FOUND' };
    }
    if (!isRecordId) {
      const matchingProducts = await ProductCatalog.countDocuments({ productCode: cleanId });
      if (matchingProducts > 1) {
        throw {
          statusCode: 409,
          message: `Product code "${cleanId}" belongs to multiple products. Refresh the catalog and edit the selected product.`,
          code: 'AMBIGUOUS_PRODUCT_CODE',
        };
      }
    }

    const oldCode = product ? product.productCode : cleanId;
    const oldName = product ? product.productName : cleanId;
    const oldBooks = product ? product.books : [];

    let newCode = oldCode;
    if (updateData.productCode && updateData.productCode.trim()) {
      newCode = updateData.productCode.trim().toUpperCase();
    }

    const newName = updateData.productName && updateData.productName.trim() ? updateData.productName.trim() : oldName;
    const newBooks = Array.isArray(updateData.books)
      ? Array.from(new Set(updateData.books.map((b) => b.trim().toUpperCase()).filter(Boolean))).sort()
      : (product ? product.books : []);

    if (!product) {
      product = new ProductCatalog({
        productCode: newCode,
        productName: newName,
        books: newBooks,
      });
    } else {
      product.productCode = newCode;
      product.productName = newName;
      product.books = newBooks;
    }
    await product.save();

    // Historical orders have no catalog ID, so use both code and name to avoid
    // changing orders that belong to a different product sharing the same code.
    await Order.updateMany(
      {
        productCode: oldCode,
        items: { $elemMatch: { productCode: oldCode, productName: oldName } },
      },
      { $set: { productCode: newCode } }
    );
    await Order.updateMany(
      { items: { $elemMatch: { productCode: oldCode, productName: oldName } } },
      { $set: { 'items.$[elem].productCode': newCode, 'items.$[elem].productName': newName } },
      { arrayFilters: [{ 'elem.productCode': oldCode, 'elem.productName': oldName }] }
    );

    // BookStock is linked by book code; update only books selected for this product.
    const removedBooks = oldBooks.filter((book) => !newBooks.includes(book));
    if (removedBooks.length > 0) {
      await BookStock.updateMany(
        { productCode: oldCode, bookCode: { $in: removedBooks } },
        { $unset: { productCode: '' } }
      );
    }
    if (newBooks.length > 0) {
      await BookStock.updateMany(
        { bookCode: { $in: newBooks } },
        { $set: { productCode: newCode } }
      );
    }

    await logAudit({
      actorUserId: userId,
      action: 'PRODUCT_UPDATED',
      entityType: 'ProductCatalog',
      entityId: product._id.toString(),
      metadata: {
        old: { productCode: oldCode, productName: oldName },
        new: { productCode: newCode, productName: newName, books: newBooks },
      },
    });

    return {
      message: `Product "${newName}" (${newCode}) successfully update ho gaya!`,
      product: {
        id: product._id.toString(),
        productCode: newCode,
        productName: newName,
        books: newBooks,
      },
    };
  }

/* =========================================================================
   BOOK STOCK HISTORY & AUDIT LOGS (किताब का पूरा इतिहास)
========================================================================= */

/**
 * Get detailed movement and transaction history for a specific book
 */
export async function getBookStockHistory(identifier: string) {
  const cleanId = identifier.trim();
  let book: any = null;

  if (mongoose.Types.ObjectId.isValid(cleanId)) {
    book = await BookStock.findById(cleanId).lean();
  }
  if (!book) {
    const cleanCode = normalizeCode(cleanId);
    book = await BookStock.findOne({ bookCode: cleanCode }).lean();
  }

  if (!book) {
    throw { statusCode: 404, message: `Book "${identifier}" not found in stock master`, code: 'BOOK_NOT_FOUND' };
  }

  const bookCode = book.bookCode;

  // 1. Fetch Inward entries & adjustments (StockInward)
  const inwardRecords = await StockInward.find({ bookCode })
    .populate('enteredByUserId', 'name email role')
    .sort({ entryDate: -1, createdAt: -1 })
    .lean();

  // 2. Fetch Dispatch logs (DispatchLog)
  const dispatchRecords = await DispatchLog.find({ verifiedBookCode: bookCode })
    .populate('orderId', 'orderCode studentName mobileNumber trackingId courierName createdAt')
    .populate('employeeId', 'name email role')
    .sort({ dispatchedAt: -1, createdAt: -1 })
    .lean();

  // 3. Fetch Audit logs for this book (AuditLog)
  const auditRecords = await AuditLog.find({
    $or: [
      { entityType: 'BookStock', entityId: book._id.toString() },
      { 'metadata.bookCode': bookCode },
    ],
  })
    .populate('actorUserId', 'name email role')
    .sort({ createdAt: -1 })
    .lean();

  // 4. Fetch Pending book entries (PendingBook)
  const pendingRecords = await PendingBook.find({ bookCode })
    .populate('addedByUserId', 'name email role')
    .sort({ createdAt: -1 })
    .lean();

  // Construct unified chronological timeline
  const timeline: any[] = [];

  // Add Inwards & Adjustments to timeline
  for (const inv of inwardRecords) {
    const user = (inv as any).enteredByUserId;
    const isReduction = inv.quantity < 0;
    const isAdjustment =
      (inv.supplier && inv.supplier.includes('Adjustment')) ||
      (inv.supplier && inv.supplier.includes('Reduction')) ||
      (inv.supplier && inv.supplier.includes('समायोजन')) ||
      (inv.supplier && inv.supplier.includes('कटौती'));

    const eventDate = inv.entryDate || inv.createdAt;
    timeline.push({
      id: (inv as any)._id.toString(),
      timestamp: eventDate,
      dateFormatted: new Date(eventDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      timeFormatted: inv.entryTime || new Date(inv.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type: isAdjustment ? (isReduction ? 'ADJUST_REDUCE' : 'ADJUST_ADD') : 'INWARD',
      category: isReduction ? 'OUT' : 'IN',
      quantityChange: inv.quantity,
      party: inv.supplier || (isAdjustment ? 'Stock Adjustment' : 'Stock Inward'),
      reference: inv.remarks || '-',
      remarks: inv.remarks || '',
      source: inv.source || 'MANUAL',
      performedBy: user ? { id: user._id?.toString(), name: user.name, email: user.email } : { name: 'System / Admin' },
    });
  }

  // Add Dispatches to timeline
  for (const d of dispatchRecords) {
    const emp = (d as any).employeeId;
    const order = (d as any).orderId;
    const eventDate = d.dispatchedAt || d.createdAt;
    const qty = d.quantity || 1;

    timeline.push({
      id: (d as any)._id.toString(),
      timestamp: eventDate,
      dateFormatted: new Date(eventDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      timeFormatted: new Date(eventDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type: 'DISPATCH',
      category: 'OUT',
      quantityChange: -qty,
      party: order ? `${order.studentName || 'Student'} (${order.trackingId || order.orderCode || 'Order'})` : 'Order Outgoing',
      reference: order ? `Tracking: ${order.trackingId || '-'} | Order: ${order.orderCode || '-'}` : (d.requestId || '-'),
      remarks: order?.courierName ? `Courier: ${order.courierName}` : 'Physical Outgoing Scan',
      source: (d as any).dispatchMode || 'BARCODE_SCAN',
      performedBy: emp ? { id: emp._id?.toString(), name: emp.name, email: emp.email } : { name: 'Employee' },
    });
  }

  // Sort timeline newest first
  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Calculate statistics
  let totalAddedInTimeline = 0;
  let totalReducedInTimeline = 0;

  for (const item of timeline) {
    if (item.category === 'IN') {
      totalAddedInTimeline += Math.abs(item.quantityChange);
    } else if (item.category === 'OUT') {
      totalReducedInTimeline += Math.abs(item.quantityChange);
    }
  }

  const bookData = {
    id: book._id.toString(),
    bookCode: book.bookCode,
    bookName: book.bookName,
    productCode: book.productCode || '',
    availableQuantity: book.availableQuantity,
    totalInward: book.totalInward,
    totalDispatched: book.totalDispatched,
    lowStockThreshold: book.lowStockThreshold || 10,
    status:
      book.availableQuantity <= 0
        ? 'OUT_OF_STOCK'
        : book.availableQuantity <= (book.lowStockThreshold || 10)
        ? 'LOW_STOCK'
        : 'IN_STOCK',
    lastRestockedAt: book.lastRestockedAt,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };

  return {
    book: bookData,
    stats: {
      currentAvailable: book.availableQuantity,
      totalInward: book.totalInward,
      totalDispatched: book.totalDispatched,
      totalAddedInTimeline,
      totalReducedInTimeline,
      timelineEventsCount: timeline.length,
      inwardTransactionsCount: inwardRecords.filter((r) => r.quantity > 0).length,
      dispatchTransactionsCount: dispatchRecords.length,
      adjustmentTransactionsCount: inwardRecords.filter(
        (r) => r.supplier?.includes('Adjustment') || r.supplier?.includes('Reduction') || r.quantity < 0
      ).length,
      pendingOrdersCount: pendingRecords.length,
    },
    timeline,
    pendingRecords: pendingRecords.map((p: any) => ({
      id: p._id.toString(),
      pendingQuantity: p.pendingQuantity,
      receivedQuantity: p.receivedQuantity,
      printerOrVendor: p.printerOrVendor,
      expectedDate: p.expectedDate,
      priority: p.priority,
      status: p.status,
      remarks: p.remarks,
      createdAt: p.createdAt,
      addedBy: p.addedByUserId ? { name: p.addedByUserId.name, email: p.addedByUserId.email } : null,
    })),
  };
}

/**
 * Export a single book's complete history timeline to Excel
 */
export async function exportBookHistoryExcel(identifier: string): Promise<Buffer> {
  const historyData = await getBookStockHistory(identifier);
  const { book, stats, timeline } = historyData;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${book.bookCode} History`);

  // Title & Metadata
  sheet.mergeCells('A1:H1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `FAST DISPATCH PRO - Book Stock Movement History: ${book.bookName} (${book.bookCode})`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  // Book Summary row
  sheet.addRow([
    `Available Stock: ${book.availableQuantity} copies`,
    `Total Inward: ${book.totalInward}`,
    `Total Dispatched: ${book.totalDispatched}`,
    `Status: ${book.status}`,
    `Product Code: ${book.productCode || 'N/A'}`,
    `Total Events: ${stats.timelineEventsCount}`,
    `Report Generated: ${new Date().toLocaleString('en-IN')}`,
    '',
  ]);
  sheet.getRow(2).font = { bold: true, size: 10, color: { argb: 'FF334155' } };
  sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sheet.addRow([]);

  // Table Headers
  const headerRow = sheet.addRow([
    '#',
    'Date',
    'Time',
    'Activity Type',
    'Stock Change (Copies)',
    'Source / Supplier / Student',
    'Reference / Tracking / Order',
    'Performed By',
  ]);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

  sheet.columns = [
    { key: 'idx', width: 6 },
    { key: 'date', width: 14 },
    { key: 'time', width: 12 },
    { key: 'type', width: 18 },
    { key: 'change', width: 22 },
    { key: 'party', width: 32 },
    { key: 'reference', width: 35 },
    { key: 'by', width: 22 },
  ];

  timeline.forEach((item: any, idx: number) => {
    const isPositive = item.quantityChange > 0;
    const typeLabel =
      item.type === 'INWARD'
        ? 'Stock Inward (आवक)'
        : item.type === 'DISPATCH'
        ? 'Order Outgoing (जावक)'
        : item.type === 'ADJUST_ADD'
        ? 'Adjustment (+)'
        : item.type === 'ADJUST_REDUCE'
        ? 'Adjustment (-)'
        : 'Update';

    const row = sheet.addRow([
      idx + 1,
      item.dateFormatted,
      item.timeFormatted,
      typeLabel,
      isPositive ? `+${item.quantityChange}` : `${item.quantityChange}`,
      item.party,
      item.reference,
      item.performedBy?.name || 'System',
    ]);

    const changeCell = row.getCell(5);
    if (isPositive) {
      changeCell.font = { bold: true, color: { argb: 'FF059669' } };
    } else {
      changeCell.font = { bold: true, color: { argb: 'FFE11D48' } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/* =========================================================================
   BULK IMPORT PRODUCTS & BOOKS VIA EXCEL (प्रोडक्ट व बुक एक्सेल बल्क अपलोड)
========================================================================= */

/**
 * Bulk upload products and book barcodes from Excel.
 * - Creates new product if product code does not exist.
 * - Existing product is preserved and any new books are attached.
 * - Creates new book ONLY if book code does not already exist.
 * - If book code exists, preserves it without duplicating, and updates its stock if quantity is provided.
 */
export async function bulkImportProductsExcel(userId: string, buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw { statusCode: 400, message: 'Excel file is empty', code: 'EMPTY_FILE' };
  }

  const headerMap = new Map<string, number>();

  // Detect header row (Row 1)
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const val = (cell.text || cell.value?.toString() || '').trim().toLowerCase().replace(/[\s\-_]/g, '');
    headerMap.set(val, colNumber);
  });

  const getColVal = (row: any, ...aliases: string[]) => {
    for (const a of aliases) {
      const col = headerMap.get(a.toLowerCase().replace(/[\s\-_]/g, ''));
      if (col) {
        const c = row.getCell(col);
        return (c.text || c.value?.toString() || '').trim();
      }
    }
    return '';
  };

  let totalRows = 0;
  let productsCreated = 0;
  let productsExisting = 0;
  let booksCreated = 0;
  let booksUpdated = 0;
  let booksPreserved = 0;

  const newProductsList: string[] = [];
  const newBooksList: string[] = [];
  const updatedBooksList: string[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  const rowDataList: Array<{
    rowNum: number;
    productCode: string;
    productName: string;
    bookCodes: string[];
    bookName: string;
    rawQty: string;
  }> = [];

  // Parse all rows
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip headers

    const rawProductCode = getColVal(
      row,
      'productcode',
      'product_code',
      'prdcode',
      'itemcode',
      'coursecode',
      'packagecode',
      'code'
    );
    const rawProductName = getColVal(
      row,
      'productname',
      'product_name',
      'prdname',
      'coursename',
      'packagename',
      'itemname',
      'title',
      'name'
    );
    const rawBookCodes = getColVal(
      row,
      'bookcode',
      'book_code',
      'bookbarcode',
      'barcode',
      'books',
      'includedbooks',
      'kitabcode'
    );
    const rawBookName = getColVal(row, 'bookname', 'book_name', 'booktitle', 'kitabnaam');
    const rawQty = getColVal(
      row,
      'stock',
      'stockquantity',
      'availablequantity',
      'quantity',
      'qty',
      'count',
      'copies',
      'totalstock'
    );

    if (!rawProductCode && !rawProductName && !rawBookCodes) {
      return; // Skip empty row
    }

    if (!rawProductCode) {
      errors.push({ row: rowNumber, error: 'Product Code is required' });
      return;
    }

    const cleanProductCode = normalizeCode(rawProductCode);
    const cleanProductName = (rawProductName || cleanProductCode).trim();

    // Split any multiple book codes (e.g. "AF-01, AF-02; AF-03")
    const bookCodes: string[] = rawBookCodes
      ? Array.from(
          new Set(
            rawBookCodes
              .split(/[,;/|\n]+/)
              .map((b: string) => normalizeCode(b))
              .filter(Boolean)
          )
        )
      : [];

    rowDataList.push({
      rowNum: rowNumber,
      productCode: cleanProductCode,
      productName: cleanProductName,
      bookCodes,
      bookName: rawBookName,
      rawQty,
    });
  });

  if (rowDataList.length === 0) {
    throw {
      statusCode: 400,
      message:
        'Excel sheet me koi valid rows nahi mili. Kripya check karein ki Product Code aur Product Name columns mojood hain.',
      code: 'NO_VALID_ROWS',
      errors,
    };
  }

  // Process rows
  for (const item of rowDataList) {
    totalRows++;
    const { productCode, productName, bookCodes, bookName, rawQty } = item;

    // 1. Handle Product in ProductCatalog
    let productDoc = await ProductCatalog.findOne({ productCode });
    if (!productDoc) {
      // Create new Product
      productDoc = await ProductCatalog.create({
        productCode,
        productName,
        books: bookCodes,
      });
      productsCreated++;
      newProductsList.push(`${productName} (${productCode})`);
    } else {
      productsExisting++;
      // Attach any new book codes if provided
      if (bookCodes.length > 0) {
        const merged = Array.from(new Set([...(productDoc.books || []), ...bookCodes]));
        if (merged.length !== (productDoc.books || []).length) {
          productDoc.books = merged;
          await productDoc.save();
        }
      }
    }

    // 2. Handle Books in BookStock
    const hasQty = rawQty !== '' && !isNaN(parseInt(rawQty, 10));
    const parsedQty = hasQty ? Math.max(0, parseInt(rawQty, 10)) : undefined;

    for (const bCode of bookCodes) {
      const cleanBCode = normalizeCode(bCode);
      const existingBook = await BookStock.findOne({ bookCode: cleanBCode });

      if (existingBook) {
        // Book ALREADY exists: preserve it, DO NOT recreate.
        // Update stock only if stock quantity was provided in Excel.
        if (parsedQty !== undefined) {
          const oldAvailable = existingBook.availableQuantity;
          existingBook.availableQuantity = parsedQty;
          if (existingBook.totalInward < existingBook.totalDispatched + parsedQty) {
            existingBook.totalInward = existingBook.totalDispatched + parsedQty;
          }
          if (!existingBook.productCode) {
            existingBook.productCode = productCode;
          }
          existingBook.lastRestockedAt = new Date();
          await existingBook.save();

          // Log stock change in StockInward for history tracking
          const diff = parsedQty - oldAvailable;
          await StockInward.create({
            bookCode: cleanBCode,
            bookName: existingBook.bookName,
            quantity: diff,
            supplier: 'Excel Product Upload (एक्सेल अपडेट)',
            remarks: `Stock updated to ${parsedQty} via Product Excel upload (${productCode})`,
            source: 'EXCEL_UPLOAD',
            enteredByUserId: new mongoose.Types.ObjectId(userId),
          });

          booksUpdated++;
          updatedBooksList.push(`${cleanBCode} (New Stock: ${parsedQty})`);
        } else {
          // If no productCode linked yet, link it
          if (!existingBook.productCode) {
            existingBook.productCode = productCode;
            await existingBook.save();
          }
          booksPreserved++;
        }
      } else {
        // Book does NOT exist: CREATE NEW BOOK
        const initialQty = parsedQty !== undefined ? parsedQty : 0;
        const bTitle = bookName && bookCodes.length === 1 ? bookName.trim() : `${productName} (${cleanBCode})`;

        const newBook = await BookStock.create({
          bookCode: cleanBCode,
          bookName: bTitle,
          productCode: productCode,
          availableQuantity: initialQty,
          totalInward: initialQty,
          totalDispatched: 0,
          lowStockThreshold: 10,
          lastRestockedAt: new Date(),
        });

        if (initialQty > 0) {
          await StockInward.create({
            bookCode: cleanBCode,
            bookName: newBook.bookName,
            quantity: initialQty,
            supplier: 'Initial Excel Stock',
            remarks: `Initial stock ${initialQty} copies for ${cleanBCode} from Product ${productCode}`,
            source: 'EXCEL_UPLOAD',
            enteredByUserId: new mongoose.Types.ObjectId(userId),
          });
        }

        booksCreated++;
        newBooksList.push(`${bTitle} (${cleanBCode})`);
      }
    }
  }

  await logAudit({
    actorUserId: userId,
    action: 'PRODUCTS_BULK_EXCEL_IMPORTED',
    entityType: 'ProductCatalog',
    entityId: 'BULK',
    metadata: {
      totalRows,
      productsCreated,
      productsExisting,
      booksCreated,
      booksUpdated,
      booksPreserved,
      errorsCount: errors.length,
    },
  });

  return {
    success: true,
    totalRows,
    productsCreated,
    productsExisting,
    booksCreated,
    booksUpdated,
    booksPreserved,
    details: {
      newProducts: newProductsList,
      newBooks: newBooksList,
      updatedBooks: updatedBooksList,
    },
    errors,
    message: `Excel Upload Successful: ${productsCreated} new products created, ${productsExisting} existing checked. ${booksCreated} new books created, ${booksUpdated} books stock updated.`,
  };
}

/**
 * Generate and download a sample Excel template for Product upload
 */
export async function downloadProductTemplateExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products & Books Template');

  // Title header banner
  sheet.mergeCells('A1:E1');
  const title = sheet.getCell('A1');
  title.value = 'FAST DISPATCH PRO - Product & Book Barcodes Upload Template';
  title.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  // Instructions row
  sheet.mergeCells('A2:E2');
  const note = sheet.getCell('A2');
  note.value =
    'NOTE: Product Code & Product Name are required. Agar Book Code pehle se hoga to duplicate nahi banega, sirf stock update hoga.';
  note.font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  note.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  sheet.getRow(2).height = 20;

  // Columns header row (Row 3)
  const headerRow = sheet.addRow([
    'Product Code *',
    'Product Name *',
    'Book Code',
    'Book Name',
    'Stock Quantity (Optional)',
  ]);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }; // Indigo
  sheet.getRow(3).height = 24;

  sheet.columns = [
    { key: 'prdCode', width: 20 },
    { key: 'prdName', width: 38 },
    { key: 'bookCode', width: 22 },
    { key: 'bookName', width: 34 },
    { key: 'stock', width: 24 },
  ];

  // Sample data rows
  const samples = [
    {
      prdCode: 'AFMEO-002',
      prdName: 'CA Final AFM Exam Oriented Batch',
      bookCode: 'AFON-002',
      bookName: 'AFM Regular Concept Book Volume 1',
      stock: 50,
    },
    {
      prdCode: 'AFMEO-002',
      prdName: 'CA Final AFM Exam Oriented Batch',
      bookCode: 'AFOS1-002',
      bookName: 'AFM Question Bank & MCQ',
      stock: 40,
    },
    {
      prdCode: 'ABFL-001',
      prdName: 'Audit Full Book Set Regular',
      bookCode: 'ACR-001',
      bookName: 'Audit Regular Concept Book',
      stock: 60,
    },
    {
      prdCode: 'AEO-001',
      prdName: 'CA Final Audit Exam Oriented Batch',
      bookCode: 'AQB-001',
      bookName: 'Audit Question Bank & Compiler',
      stock: 35,
    },
  ];

  samples.forEach((s) => {
    sheet.addRow([s.prdCode, s.prdName, s.bookCode, s.bookName, s.stock]);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}


