import { Router } from 'express';
import multer from 'multer';
import * as stockController from '../controllers/stock.controller';
import { authenticate, requireRole } from '../middleware/auth';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV (.csv) files are permitted'));
    }
  },
});

const router = Router();

router.use(authenticate);

// Accessible by both ADMIN and EMPLOYEE
router.get('/available', requireRole('ADMIN', 'EMPLOYEE'), stockController.getAvailableStock);
router.get('/inward', requireRole('ADMIN', 'EMPLOYEE'), stockController.getInwardHistory);
router.post('/inward', requireRole('ADMIN', 'EMPLOYEE'), stockController.addInwardEntry);
router.post('/inward/bulk', requireRole('ADMIN', 'EMPLOYEE'), upload.single('file'), stockController.bulkInwardExcel);
router.delete('/inward/:id', requireRole('ADMIN', 'EMPLOYEE'), stockController.deleteInwardEntry);
router.post('/adjust', requireRole('ADMIN', 'EMPLOYEE'), stockController.adjustStock);
router.put('/adjust', requireRole('ADMIN', 'EMPLOYEE'), stockController.adjustStock);
router.get('/search-catalog', requireRole('ADMIN', 'EMPLOYEE'), stockController.searchBookCatalog);
router.get('/export/available', requireRole('ADMIN', 'EMPLOYEE'), stockController.exportStockExcel);
router.get('/export/inward', requireRole('ADMIN', 'EMPLOYEE'), stockController.exportInwardExcel);
router.delete('/book/:identifier', requireRole('ADMIN', 'EMPLOYEE'), stockController.deleteBookStock);
router.put('/book/:identifier', requireRole('ADMIN', 'EMPLOYEE'), stockController.updateBookDetails);
router.get('/book/:identifier/history', requireRole('ADMIN', 'EMPLOYEE'), stockController.getBookStockHistory);
router.get('/book/:identifier/history/export', requireRole('ADMIN', 'EMPLOYEE'), stockController.exportBookHistoryExcel);
router.delete('/clear-all', requireRole('ADMIN'), stockController.clearAllStock);
router.get('/barcode-catalog', requireRole('ADMIN', 'EMPLOYEE'), stockController.getBarcodeCatalog);
router.post('/barcode-catalog/book', requireRole('ADMIN'), stockController.addBookBarcode);
router.post('/barcode-catalog/product', requireRole('ADMIN'), stockController.addProductBarcode);
router.put('/product/:identifier', requireRole('ADMIN', 'EMPLOYEE'), stockController.updateProductDetails);
router.delete('/product/:identifier', requireRole('ADMIN', 'EMPLOYEE'), stockController.deleteProduct);

// Pending Book Stock Routes (पेंडिंग बुक स्टॉक)
router.get('/pending', requireRole('ADMIN', 'EMPLOYEE'), stockController.getPendingBooks);
router.post('/pending', requireRole('ADMIN', 'EMPLOYEE'), stockController.addPendingBook);
router.put('/pending/:id', requireRole('ADMIN', 'EMPLOYEE'), stockController.updatePendingBook);
router.delete('/pending/:id', requireRole('ADMIN', 'EMPLOYEE'), stockController.deletePendingBook);
router.post('/pending/:id/receive', requireRole('ADMIN', 'EMPLOYEE'), stockController.receivePendingBook);

export default router;
