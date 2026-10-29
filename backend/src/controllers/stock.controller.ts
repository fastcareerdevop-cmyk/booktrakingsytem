import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as stockService from '../services/stock.service';
import { successResponse, errorResponse } from '../utils/response';

export async function getAvailableStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { search, status, page, limit, sortBy, sortOrder } = req.query;

    const result = await stockService.getAvailableStock({
      search: search as string,
      status: status as any,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
      sortBy: sortBy as string,
      sortOrder: sortOrder as any,
    });

    return successResponse(res, 'Available stock retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function addInwardEntry(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { bookCode, bookName, quantity, supplier, remarks, source, entryDate, entryTime } = req.body;

    const result = await stockService.addInwardEntry(req.user!.id, {
      bookCode,
      bookName,
      quantity,
      supplier,
      remarks,
      source,
      entryDate,
      entryTime,
    });

    return successResponse(res, `Stock entry saved! Added ${quantity} copies of "${bookName}".`, result, 201);
  } catch (error) {
    next(error);
  }
}

export async function bulkInwardExcel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.file || !req.file.buffer) {
      return errorResponse(res, 'No Excel file uploaded', 'FILE_REQUIRED', 400);
    }

    const result = await stockService.bulkInwardExcel(req.user!.id, req.file.buffer);

    return successResponse(
      res,
      `Excel Stock Import complete: ${result.totalImportedCopies} copies (${result.importedEntries} entries) added to stock!`,
      result,
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function getInwardHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { search, startDate, endDate, page, limit } = req.query;

    const result = await stockService.getInwardHistory({
      search: search as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });

    return successResponse(res, 'Inward history retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function deleteInwardEntry(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await stockService.deleteInwardEntry(req.user!.id, id);
    return successResponse(res, result.message, result);
  } catch (error) {
    next(error);
  }
}

export async function searchBookCatalog(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { q } = req.query;
    const result = await stockService.searchBookCatalog((q as string) || '');
    return successResponse(res, 'Catalog search results', result);
  } catch (error) {
    next(error);
  }
}

export async function exportStockExcel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const buffer = await stockService.exportStockExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=available-stock-${new Date().toISOString().slice(0, 10)}.xlsx`);
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
}

export async function exportInwardExcel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const buffer = await stockService.exportInwardExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=inward-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
}

export async function clearAllStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.clearAllStock(req.user!.id);
    return successResponse(res, result.message, result);
  } catch (error) {
    next(error);
  }
}

export async function adjustStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.adjustStock(req.user!.id, req.body);
    return successResponse(res, result.message, result);
  } catch (error) {
    next(error);
  }
}

export async function deleteBookStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.deleteBookStock(req.user!.id, req.params.identifier);
    return successResponse(res, result.message, result);
  } catch (error) {
    next(error);
  }
}

export async function updateBookDetails(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.updateBookDetails(req.user!.id, req.params.identifier, req.body);
    return successResponse(res, result.message, result.book);
  } catch (error) {
    next(error);
  }
}

export async function getPendingBooks(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { search, status, priority, page, limit } = req.query;
    const result = await stockService.getPendingBooks({
      search: search as string,
      status: status as any,
      priority: priority as any,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    return successResponse(res, 'Pending books retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function addPendingBook(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.addPendingBook(req.user!.id, req.body);
    return successResponse(res, result.message, result.pendingBook, 201);
  } catch (error) {
    next(error);
  }
}

export async function updatePendingBook(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.updatePendingBook(req.user!.id, req.params.id, req.body);
    return successResponse(res, result.message, result.pendingBook);
  } catch (error) {
    next(error);
  }
}

export async function deletePendingBook(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.deletePendingBook(req.user!.id, req.params.id);
    return successResponse(res, result.message, result);
  } catch (error) {
    next(error);
  }
}

export async function receivePendingBook(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.receivePendingBook(req.user!.id, req.params.id, req.body);
    return successResponse(res, result.message, result);
  } catch (error) {
    next(error);
  }
}

export async function getBarcodeCatalog(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.getBarcodeCatalog();
    return successResponse(res, 'Barcode catalog retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function addBookBarcode(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.addBookBarcode(req.user!.id, req.body);
    return successResponse(res, result.message, result.book, 201);
  } catch (error) {
    next(error);
  }
}

export async function addProductBarcode(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.addProductBarcode(req.user!.id, req.body);
    return successResponse(res, result.message, result.product, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateProductDetails(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.updateProductDetails(req.user!.id, req.params.identifier, req.body);
    return successResponse(res, result.message, result.product);
  } catch (error) {
    next(error);
  }
}

export async function deleteProduct(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.deleteProduct(req.user!.id, req.params.identifier);
    return successResponse(res, result.message, result);
  } catch (error) {
    next(error);
  }
}

export async function getBookStockHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await stockService.getBookStockHistory(req.params.identifier);
    return successResponse(res, 'Book stock history retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function exportBookHistoryExcel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const buffer = await stockService.exportBookHistoryExcel(req.params.identifier);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=book-history-${req.params.identifier}-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
}

export async function bulkImportProductsExcel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.file || !req.file.buffer) {
      return errorResponse(res, 'No Excel file uploaded', 'FILE_REQUIRED', 400);
    }

    const result = await stockService.bulkImportProductsExcel(req.user!.id, req.file.buffer);
    return successResponse(res, result.message, result, 201);
  } catch (error) {
    next(error);
  }
}

export async function downloadProductTemplateExcel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const buffer = await stockService.downloadProductTemplateExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Product_Book_Upload_Template.xlsx');
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
}


