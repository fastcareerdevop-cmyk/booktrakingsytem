import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middleware/auth';
import { ProductCatalog, BookStock, PackagePreparation, Order } from '../models';
import { successResponse, errorResponse } from '../utils/response';
import { normalizeBookCode } from '../utils/normalize';
import { logAudit } from '../utils/audit';

/**
 * Get all available products with preparation & stock details
 */
export async function getProducts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    // 1. Get products from ProductCatalog
    const catalogProducts = await ProductCatalog.find({}).sort({ productCode: 1 }).lean();

    // 2. Discover any additional products from Orders or BookStock
    const knownProductCodes = new Set(catalogProducts.map(p => p.productCode.toUpperCase().trim()));

    const orderProducts = await Order.aggregate([
      { $match: { productCode: { $exists: true, $ne: '' } } },
      {
        $group: {
          _id: { productCode: '$productCode' },
          productName: { $first: '$items.productName' },
          books: { $addToSet: '$items.bookCode' },
        },
      },
    ]);

    const allProductsMap = new Map<string, { productCode: string; productName: string; books: string[] }>();

    for (const p of catalogProducts) {
      allProductsMap.set(p.productCode.toUpperCase().trim(), {
        productCode: p.productCode.toUpperCase().trim(),
        productName: p.productName || p.productCode,
        books: p.books || [],
      });
    }

    for (const op of orderProducts) {
      const pCode = (op._id.productCode || '').toUpperCase().trim();
      if (pCode && !knownProductCodes.has(pCode)) {
        const flattenedBooks: string[] = Array.from(new Set((op.books || []).flat().filter(Boolean)));
        allProductsMap.set(pCode, {
          productCode: pCode,
          productName: (Array.isArray(op.productName) ? op.productName[0] : op.productName) || pCode,
          books: flattenedBooks,
        });
      }
    }

    // 3. For each product, fetch its Preparation data and Book Stock
    const preparations = await PackagePreparation.find({}).lean();
    const prepMap = new Map<string, any>();
    for (const prep of preparations) {
      prepMap.set(prep.productCode.toUpperCase().trim(), prep);
    }

    const allBookStocks = await BookStock.find({}).lean();
    const stockMap = new Map<string, any>();
    for (const bs of allBookStocks) {
      stockMap.set(normalizeBookCode(bs.bookCode), bs);
    }

    const resultList: any[] = [];

    for (const [pCode, pData] of allProductsMap.entries()) {
      const prepDoc = prepMap.get(pCode);
      const packagedStock = prepDoc?.packagedStock ?? 0;

      // Calculate stock for each book in product
      let minBookStock = 999999;
      const booksDetail: any[] = [];

      for (const bCode of pData.books) {
        const cleanBCode = normalizeBookCode(bCode);
        const bookStock = stockMap.get(cleanBCode);
        const avail = bookStock?.availableQuantity ?? 0;
        const bName = bookStock?.bookName || bCode;

        if (avail < minBookStock) {
          minBookStock = avail;
        }

        booksDetail.push({
          bookCode: bCode,
          bookName: bName,
          availableQuantity: avail,
        });
      }

      const packableSets = pData.books.length > 0 ? (minBookStock === 999999 ? 0 : minBookStock) : 0;
      const totalBooksCopies = booksDetail.reduce((acc, b) => acc + (b.availableQuantity || 0), 0);
      const shelfStock = Math.max(0, packableSets - packagedStock);
      const totalAvailableStock = shelfStock + packagedStock;

      resultList.push({
        productCode: pCode,
        productName: pData.productName,
        books: booksDetail,
        totalBooksCount: booksDetail.length,
        packableSets,
        totalBooksCopies,
        packagedStock,
        shelfStock,
        totalAvailableStock,
        totalBatchesPacked: prepDoc?.totalBatchesPacked ?? 0,
        lastPackedAt: prepDoc?.updatedAt || null,
      });
    }

    const totalPackagedSets = preparations.reduce((acc, p) => acc + (p.packagedStock || 0), 0);
    const totalWarehouseAvailable = allBookStocks.reduce((acc, b) => acc + (b.availableQuantity || 0), 0);
    const totalShelfStock = Math.max(0, totalWarehouseAvailable - totalPackagedSets);

    return successResponse(res, 'Preparation products fetched successfully', {
      products: resultList,
      totalCount: resultList.length,
      summary: {
        totalAvailableStock: totalWarehouseAvailable,
        shelfStock: totalShelfStock,
        packagedStock: totalPackagedSets,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Record a completed pre-packaging batch
 * Operator packed X sets of a product by scanning books one-by-one.
 */
export async function packBatch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { productCode, quantity, scannedBooks, batchId } = req.body;

    const cleanProductCode = (productCode || '').trim().toUpperCase();
    const parsedQty = parseInt(quantity, 10);

    if (!cleanProductCode) {
      return errorResponse(res, 'Product code is required', 'PRODUCT_CODE_REQUIRED', 400);
    }

    if (isNaN(parsedQty) || parsedQty <= 0) {
      return errorResponse(res, 'Valid packaging quantity (> 0) is required', 'INVALID_QUANTITY', 400);
    }

    // Find or create PackagePreparation record
    let prep = await PackagePreparation.findOne({ productCode: cleanProductCode });

    // Look up product info
    let productName = cleanProductCode;
    let booksList: { bookCode: string; bookName: string }[] = [];

    const catalogDoc = await ProductCatalog.findOne({ productCode: cleanProductCode });
    if (catalogDoc) {
      productName = catalogDoc.productName || cleanProductCode;
      for (const bCode of catalogDoc.books || []) {
        const bs = await BookStock.findOne({ bookCode: normalizeBookCode(bCode) });
        booksList.push({
          bookCode: bCode,
          bookName: bs?.bookName || bCode,
        });
      }
    } else {
      // Check from orders
      const orderSample = await Order.findOne({ productCode: cleanProductCode });
      if (orderSample) {
        productName = orderSample.items?.[0]?.productName || cleanProductCode;
        for (const it of orderSample.items || []) {
          booksList.push({
            bookCode: it.bookCode,
            bookName: it.bookName || it.bookCode,
          });
        }
      }
    }

    const currentBatchId = batchId || `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    if (!prep) {
      prep = new PackagePreparation({
        productCode: cleanProductCode,
        productName,
        books: booksList,
        packagedStock: parsedQty,
        shelfStock: 0,
        totalAvailableStock: parsedQty,
        totalBatchesPacked: 1,
        history: [
          {
            batchId: currentBatchId,
            quantity: parsedQty,
            booksScanned: scannedBooks || [],
            employeeId: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : undefined,
            employeeName: req.user?.name || 'Warehouse Operator',
            createdAt: new Date(),
          },
        ],
      });
    } else {
      prep.packagedStock = (prep.packagedStock || 0) + parsedQty;
      prep.totalBatchesPacked = (prep.totalBatchesPacked || 0) + 1;
      prep.history.unshift({
        batchId: currentBatchId,
        quantity: parsedQty,
        booksScanned: scannedBooks || [],
        employeeId: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : undefined,
        employeeName: req.user?.name || 'Warehouse Operator',
        createdAt: new Date(),
      });
      if (booksList.length > 0 && prep.books.length === 0) {
        prep.books = booksList;
      }
    }

    await prep.save();

    if (req.user) {
      await logAudit({
        actorUserId: req.user.id,
        action: 'PACKAGING_BATCH_COMPLETED',
        entityType: 'PackagePreparation',
        entityId: prep._id.toString(),
        metadata: {
          productCode: cleanProductCode,
          quantityPacked: parsedQty,
          batchId: currentBatchId,
        },
      });
    }

    return successResponse(res, `Successfully packed ${parsedQty} package(s) of "${cleanProductCode}"! Total packaged stock is now ${prep.packagedStock}.`, {
      productCode: cleanProductCode,
      productName: prep.productName,
      packagedStock: prep.packagedStock,
      batchId: currentBatchId,
      quantityPacked: parsedQty,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get overall summary stats for Outgoing Sheet 2 cards:
 * Available Stock, Shelf Available, Parcel Packaging
 */
export async function getStockSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const preparations = await PackagePreparation.find({}).lean();
    const allBookStocks = await BookStock.find({}).lean();

    const totalPackagedSets = preparations.reduce((acc, p) => acc + (p.packagedStock || 0), 0);
    const totalWarehouseAvailable = allBookStocks.reduce((acc, b) => acc + (b.availableQuantity || 0), 0);
    const totalShelfStock = Math.max(0, totalWarehouseAvailable - totalPackagedSets);

    return successResponse(res, 'Stock summary retrieved', {
      totalAvailableStock: totalWarehouseAvailable,
      shelfStock: totalShelfStock,
      packagedStock: totalPackagedSets,
      totalProductsPrepared: preparations.length,
      preparations,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Dispatch V2 logic:
 * When an order is fulfilled in Outgoing Sheet 2:
 * - If packaged packages exist: deducts from packagedStock first!
 * - If packaged packages are 0: deducts directly from shelfStock!
 */
export async function dispatchPackageV2(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { productCode, quantity = 1 } = req.body;
    const cleanProductCode = (productCode || '').trim().toUpperCase();
    const qty = parseInt(quantity, 10) || 1;

    if (!cleanProductCode) {
      return errorResponse(res, 'Product code is required', 'PRODUCT_CODE_REQUIRED', 400);
    }

    const prep = await PackagePreparation.findOne({ productCode: cleanProductCode });
    let source = 'SHELF_STOCK';

    if (prep && prep.packagedStock >= qty) {
      prep.packagedStock -= qty;
      await prep.save();
      source = 'PACKAGED_STOCK';
    } else if (prep && prep.packagedStock > 0) {
      const remainingFromShelf = qty - prep.packagedStock;
      prep.packagedStock = 0;
      await prep.save();
      source = `HYBRID (${prep.packagedStock} packaged + ${remainingFromShelf} shelf)`;
    } else {
      source = 'SHELF_STOCK';
    }

    return successResponse(res, `Dispatched ${qty} set(s) of "${cleanProductCode}" using ${source}.`, {
      productCode: cleanProductCode,
      source,
      remainingPackagedStock: prep ? prep.packagedStock : 0,
    });
  } catch (error) {
    next(error);
  }
}
