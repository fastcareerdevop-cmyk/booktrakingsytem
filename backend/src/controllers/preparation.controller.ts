import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middleware/auth';
import { ProductCatalog, BookStock, PackagePreparation, Order } from '../models';
import { getBarcodeCatalog } from '../services/stock.service';
import { successResponse, errorResponse } from '../utils/response';
import { normalizeBookCode } from '../utils/normalize';
import { logAudit } from '../utils/audit';

/**
 * Get all available products with preparation & stock details
 * Resolves all product variants from Barcode Catalog so no duplicate-code products are collapsed.
 */
export async function getProducts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const [barcodeData, preparations, allBookStocks] = await Promise.all([
      getBarcodeCatalog(),
      PackagePreparation.find({}).lean(),
      BookStock.find({}).lean(),
    ]);

    const productsList = barcodeData.products || [];

    const productKey = (code: string, name: string) =>
      `${(code || '').toUpperCase().trim()}||${(name || '').trim().toLowerCase()}`;

    // Map preparations by key: productCode + productName
    const prepMap = new Map<string, any>();
    const prepCodeMap = new Map<string, any>(); // Fallback for single-variant products
    for (const prep of preparations) {
      const pCode = (prep.productCode || '').toUpperCase().trim();
      const pName = (prep.productName || '').trim();
      if (pCode && pName) {
        prepMap.set(productKey(pCode, pName), prep);
      }
      if (pCode && !prepCodeMap.has(pCode)) {
        prepCodeMap.set(pCode, prep);
      }
    }

    // Count how many products share each productCode
    const codeProductCount = new Map<string, number>();
    for (const p of productsList) {
      const c = (p.productCode || '').toUpperCase().trim();
      codeProductCount.set(c, (codeProductCount.get(c) || 0) + 1);
    }

    const stockMap = new Map<string, any>();
    for (const bs of allBookStocks) {
      stockMap.set(normalizeBookCode(bs.bookCode), bs);
    }

    const resultList: any[] = [];

    for (const p of productsList) {
      const pCode = (p.productCode || '').toUpperCase().trim();
      const pName = (p.productName || pCode).trim();
      const key = productKey(pCode, pName);

      // Match prep record: by exact (code + name), or fallback to code if this code is unique
      let prepDoc = prepMap.get(key);
      if (!prepDoc && codeProductCount.get(pCode) === 1) {
        prepDoc = prepCodeMap.get(pCode);
      }

      const packagedStock = prepDoc?.packagedStock ?? 0;

      // Calculate stock for each book in product
      let minBookStock = 999999;
      const booksDetail: any[] = [];

      for (const bCode of p.books || []) {
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

      const packableSets = (p.books || []).length > 0 ? (minBookStock === 999999 ? 0 : minBookStock) : 0;
      const totalBooksCopies = booksDetail.reduce((acc, b) => acc + (b.availableQuantity || 0), 0);
      const shelfStock = Math.max(0, packableSets - packagedStock);
      const totalAvailableStock = shelfStock + packagedStock;

      resultList.push({
        id: p.id || key,
        productCode: pCode,
        productName: pName,
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

    // Calculate total individual book copies inside all ready packaged sets
    const bookPackagedMap = new Map<string, number>();
    let totalPackagedSets = 0;

    for (const prep of preparations) {
      const pQty = prep.packagedStock || 0;
      if (pQty <= 0) continue;
      totalPackagedSets += pQty;

      const pCode = (prep.productCode || '').toUpperCase().trim();
      const pName = (prep.productName || '').trim();
      const matchingProduct = productsList.find((p: any) =>
        (p.productCode || '').toUpperCase().trim() === pCode &&
        (!pName || (p.productName || '').trim().toLowerCase() === pName.toLowerCase())
      ) || productsList.find((p: any) => (p.productCode || '').toUpperCase().trim() === pCode);

      const booksList: string[] = (matchingProduct && matchingProduct.books?.length > 0)
        ? matchingProduct.books
        : (prep.books || []).map((b: any) => b.bookCode);

      for (const bCode of booksList) {
        const clean = normalizeBookCode(bCode);
        bookPackagedMap.set(clean, (bookPackagedMap.get(clean) || 0) + pQty);
      }
    }

    let totalPackagedBooks = 0;
    for (const bs of allBookStocks) {
      if (bs.availableQuantity > 0) {
        const clean = normalizeBookCode(bs.bookCode);
        const pQty = bookPackagedMap.get(clean) || 0;
        totalPackagedBooks += Math.min(bs.availableQuantity, pQty);
      }
    }

    const totalWarehouseAvailable = allBookStocks.reduce((acc, b) => acc + (b.availableQuantity || 0), 0);
    const totalShelfStock = Math.max(0, totalWarehouseAvailable - totalPackagedBooks);

    return successResponse(res, 'Preparation products fetched successfully', {
      products: resultList,
      totalCount: resultList.length,
      summary: {
        totalAvailableStock: totalWarehouseAvailable,
        shelfStock: totalShelfStock,
        packagedStock: totalPackagedSets,
        packagedBooksCount: totalPackagedBooks,
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
    const { productCode, productName, quantity, scannedBooks, batchId } = req.body;

    const cleanProductCode = (productCode || '').trim().toUpperCase();
    const cleanProductName = (productName || '').trim();
    const parsedQty = parseInt(quantity, 10);

    if (!cleanProductCode) {
      return errorResponse(res, 'Product code is required', 'PRODUCT_CODE_REQUIRED', 400);
    }

    if (isNaN(parsedQty) || parsedQty <= 0) {
      return errorResponse(res, 'Valid packaging quantity (> 0) is required', 'INVALID_QUANTITY', 400);
    }

    // Find or create PackagePreparation record
    let prep = cleanProductName
      ? await PackagePreparation.findOne({ productCode: cleanProductCode, productName: cleanProductName })
      : null;

    if (!prep && !cleanProductName) {
      prep = await PackagePreparation.findOne({ productCode: cleanProductCode });
    }

    // Look up product info
    let resolvedProductName = cleanProductName || cleanProductCode;
    let booksList: { bookCode: string; bookName: string }[] = [];

    const catalogDoc = cleanProductName
      ? await ProductCatalog.findOne({ productCode: cleanProductCode, productName: cleanProductName })
      : await ProductCatalog.findOne({ productCode: cleanProductCode });

    if (catalogDoc) {
      resolvedProductName = catalogDoc.productName || resolvedProductName;
      for (const bCode of catalogDoc.books || []) {
        const bs = await BookStock.findOne({ bookCode: normalizeBookCode(bCode) });
        booksList.push({
          bookCode: bCode,
          bookName: bs?.bookName || bCode,
        });
      }
    } else {
      // Check from orders
      const orderSample = await Order.findOne({
        $or: [
          { productCode: cleanProductCode },
          { 'items.productCode': cleanProductCode },
        ],
      });
      if (orderSample) {
        resolvedProductName = orderSample.items?.[0]?.productName || cleanProductCode;
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
        productName: resolvedProductName,
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
          productName: resolvedProductName,
          quantityPacked: parsedQty,
          batchId: currentBatchId,
        },
      });
    }

    return successResponse(res, `Successfully packed ${parsedQty} package(s) of "${resolvedProductName}"! Total packaged stock is now ${prep.packagedStock}.`, {
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
    const [preparations, allBookStocks, catalogProducts] = await Promise.all([
      PackagePreparation.find({}).lean(),
      BookStock.find({}).lean(),
      ProductCatalog.find({}).lean(),
    ]);

    const catalogKey = (code: string, name: string) =>
      `${(code || '').toUpperCase().trim()}||${(name || '').trim().toLowerCase()}`;

    const catalogMap = new Map<string, string[]>();
    const catalogCodeMap = new Map<string, string[]>();

    for (const cp of catalogProducts) {
      if (cp.productCode && cp.books) {
        const books = cp.books.map((b: any) => normalizeBookCode(b));
        catalogMap.set(catalogKey(cp.productCode, cp.productName), books);
        if (!catalogCodeMap.has(cp.productCode.toUpperCase().trim())) {
          catalogCodeMap.set(cp.productCode.toUpperCase().trim(), books);
        }
      }
    }

    const bookPackagedMap = new Map<string, number>();
    let totalPackagedSets = 0;

    for (const prep of preparations) {
      const pQty = prep.packagedStock || 0;
      if (pQty <= 0) continue;
      totalPackagedSets += pQty;

      const pCode = (prep.productCode || '').toUpperCase().trim();
      const pName = (prep.productName || '').trim();
      let booksForProduct: string[] = [];
      if (prep.books && prep.books.length > 0) {
        booksForProduct = prep.books.map((b: any) => normalizeBookCode(b.bookCode));
      } else if (catalogMap.has(catalogKey(pCode, pName))) {
        booksForProduct = catalogMap.get(catalogKey(pCode, pName)) || [];
      } else if (catalogCodeMap.has(pCode)) {
        booksForProduct = catalogCodeMap.get(pCode) || [];
      }

      for (const bCode of booksForProduct) {
        const clean = normalizeBookCode(bCode);
        bookPackagedMap.set(clean, (bookPackagedMap.get(clean) || 0) + pQty);
      }
    }

    let totalPackagedBooks = 0;
    for (const bs of allBookStocks) {
      if (bs.availableQuantity > 0) {
        const clean = normalizeBookCode(bs.bookCode);
        const pQty = bookPackagedMap.get(clean) || 0;
        totalPackagedBooks += Math.min(bs.availableQuantity, pQty);
      }
    }

    const totalWarehouseAvailable = allBookStocks.reduce((acc, b) => acc + (b.availableQuantity || 0), 0);
    const totalShelfStock = Math.max(0, totalWarehouseAvailable - totalPackagedBooks);

    return successResponse(res, 'Stock summary retrieved', {
      totalAvailableStock: totalWarehouseAvailable,
      shelfStock: totalShelfStock,
      packagedStock: totalPackagedSets,
      packagedBooksCount: totalPackagedBooks,
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
    const { productCode, productName, quantity = 1 } = req.body;
    const cleanProductCode = (productCode || '').trim().toUpperCase();
    const cleanProductName = (productName || '').trim();
    const qty = parseInt(quantity, 10) || 1;

    if (!cleanProductCode) {
      return errorResponse(res, 'Product code is required', 'PRODUCT_CODE_REQUIRED', 400);
    }

    let prep = cleanProductName
      ? await PackagePreparation.findOne({ productCode: cleanProductCode, productName: cleanProductName })
      : null;
    if (!prep) {
      prep = await PackagePreparation.findOne({ productCode: cleanProductCode });
    }

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

    return successResponse(res, `Dispatched ${qty} set(s) of "${cleanProductName || cleanProductCode}" using ${source}.`, {
      productCode: cleanProductCode,
      productName: cleanProductName,
      source,
      remainingPackagedStock: prep ? prep.packagedStock : 0,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Direct update or edit of packaged stock for a product
 * Allows increasing, decreasing, or directly setting packagedStock
 */
export async function updatePackagedStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { productCode, productName, packagedStock } = req.body;
    const cleanProductCode = (productCode || '').trim().toUpperCase();
    const cleanProductName = (productName || '').trim();
    const newQty = Math.max(0, parseInt(packagedStock, 10) || 0);

    if (!cleanProductCode) {
      return errorResponse(res, 'Product code is required', 'PRODUCT_CODE_REQUIRED', 400);
    }

    let prep = cleanProductName
      ? await PackagePreparation.findOne({ productCode: cleanProductCode, productName: cleanProductName })
      : null;

    if (!prep && !cleanProductName) {
      prep = await PackagePreparation.findOne({ productCode: cleanProductCode });
    }

    if (!prep) {
      // Find product books
      const catalogDoc = cleanProductName
        ? await ProductCatalog.findOne({ productCode: cleanProductCode, productName: cleanProductName })
        : await ProductCatalog.findOne({ productCode: cleanProductCode });

      const booksList: any[] = [];
      if (catalogDoc && catalogDoc.books) {
        for (const bCode of catalogDoc.books) {
          const bs = await BookStock.findOne({ bookCode: normalizeBookCode(bCode) });
          booksList.push({
            bookCode: bCode,
            bookName: bs?.bookName || bCode,
          });
        }
      }

      prep = new PackagePreparation({
        productCode: cleanProductCode,
        productName: cleanProductName || catalogDoc?.productName || cleanProductCode,
        books: booksList,
        packagedStock: newQty,
        shelfStock: 0,
        totalAvailableStock: newQty,
        totalBatchesPacked: newQty > 0 ? 1 : 0,
        history: [],
      });
    } else {
      prep.packagedStock = newQty;
    }

    await prep.save();

    if (req.user) {
      await logAudit({
        actorUserId: req.user.id,
        action: 'PACKAGED_STOCK_UPDATED',
        entityType: 'PackagePreparation',
        entityId: prep._id.toString(),
        metadata: {
          productCode: cleanProductCode,
          productName: prep.productName,
          newPackagedStock: newQty,
        },
      });
    }

    return successResponse(res, `Packaged stock for "${prep.productName || cleanProductCode}" updated to ${newQty}.`, {
      productCode: cleanProductCode,
      productName: prep.productName,
      packagedStock: prep.packagedStock,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Reset / Delete packaged stock of a product (sets packagedStock to 0)
 */
export async function resetPackagedStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { productCode, productName } = req.body;
    const cleanProductCode = (productCode || '').trim().toUpperCase();
    const cleanProductName = (productName || '').trim();

    if (!cleanProductCode) {
      return errorResponse(res, 'Product code is required', 'PRODUCT_CODE_REQUIRED', 400);
    }

    let prep = cleanProductName
      ? await PackagePreparation.findOne({ productCode: cleanProductCode, productName: cleanProductName })
      : null;

    if (!prep && !cleanProductName) {
      prep = await PackagePreparation.findOne({ productCode: cleanProductCode });
    }

    if (prep) {
      prep.packagedStock = 0;
      await prep.save();
    }

    if (req.user && prep) {
      await logAudit({
        actorUserId: req.user.id,
        action: 'PACKAGED_STOCK_RESET',
        entityType: 'PackagePreparation',
        entityId: prep._id.toString(),
        metadata: { productCode: cleanProductCode, productName: prep.productName },
      });
    }

    return successResponse(res, `Packaged stock for "${prep?.productName || cleanProductCode}" reset to 0.`, {
      productCode: cleanProductCode,
      productName: prep?.productName,
      packagedStock: 0,
    });
  } catch (error) {
    next(error);
  }
}
