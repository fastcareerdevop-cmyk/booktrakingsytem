import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Barcode,
  Search,
  Printer,
  Download,
  BookOpen,
  Package,
  Layers,
  LayoutGrid,
  LayoutList,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Sparkles,
  Edit3,
  Trash2,
  X,
  Plus,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { ProductExcelUploadModal } from '../components/stock/ProductExcelUploadModal';
import { BarcodeDisplay } from '../components/common/BarcodeDisplay';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface BookItem {
  id: string;
  bookCode: string;
  bookName: string;
  productCode?: string;
  availableQuantity: number;
  totalInward: number;
  totalDispatched: number;
  pendingQuantity: number;
  type: 'BOOK';
}

interface ProductItem {
  id: string;
  productCode: string;
  productName: string;
  books: string[];
  totalBooksCount: number;
  totalOrdersCount: number;
  type: 'PRODUCT';
}

export const BarcodeCatalogPage: React.FC = () => {
  const { success, error, warning } = useToast();
  const { isAdmin } = useAuth();
  const [books, setBooks] = useState<BookItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<'ALL' | 'BOOKS' | 'PRODUCTS'>('ALL');
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');

  // Custom Barcode Tester
  const [testerInput, setTesterInput] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Edit Product Modal State
  const [editProductModal, setEditProductModal] = useState<ProductItem | null>(null);
  const [editProductCode, setEditProductCode] = useState('');
  const [editProductName, setEditProductName] = useState('');
  const [editProductBooks, setEditProductBooks] = useState('');
  const [isUpdatingProduct, setIsUpdatingProduct] = useState(false);
  const [deletingBarcode, setDeletingBarcode] = useState<string | null>(null);

  // Edit Book Modal State
  const [editBookModal, setEditBookModal] = useState<BookItem | null>(null);
  const [editBookCode, setEditBookCode] = useState('');
  const [editBookName, setEditBookName] = useState('');
  const [editBookProductCode, setEditBookProductCode] = useState('');
  const [editBookAvailableStock, setEditBookAvailableStock] = useState('0');
  const [isUpdatingBook, setIsUpdatingBook] = useState(false);
  const [showAddBookModal, setShowAddBookModal] = useState(false);
  const [addBookCode, setAddBookCode] = useState('');
  const [addBookName, setAddBookName] = useState('');
  const [addBookProductCode, setAddBookProductCode] = useState('');
  const [isAddingBook, setIsAddingBook] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showBulkProductModal, setShowBulkProductModal] = useState(false);
  const [addProductCode, setAddProductCode] = useState('');
  const [addProductName, setAddProductName] = useState('');
  const [addProductBooks, setAddProductBooks] = useState('');
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Fetch Barcode Catalog
  const fetchCatalog = async () => {
    try {
      setLoading(true);
      const res = await api.get('/stock/barcode-catalog');
      if (res.data?.success && res.data?.data) {
        setBooks(res.data.data.books || []);
        setProducts(res.data.data.products || []);
      }
    } catch (err: any) {
      console.error('Failed to load barcode catalog:', err);
      error('Barcode Catalog load nahi ho paya.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingBook(true);
    try {
      const res = await api.post('/stock/barcode-catalog/book', {
        bookCode: addBookCode.trim(),
        bookName: addBookName.trim(),
        productCode: addBookProductCode.trim(),
      });
      success(res.data?.message || 'Book barcode added successfully');
      setShowAddBookModal(false);
      setAddBookCode('');
      setAddBookName('');
      setAddBookProductCode('');
      await fetchCatalog();
    } catch (err: any) {
      error(err.response?.data?.message || 'Book barcode add nahi ho paya');
    } finally {
      setIsAddingBook(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingProduct(true);
    try {
      const res = await api.post('/stock/barcode-catalog/product', {
        productCode: addProductCode.trim(),
        productName: addProductName.trim(),
        books: addProductBooks.split(',').map((book) => book.trim()).filter(Boolean),
      });
      success(res.data?.message || 'Product barcode added successfully');
      setShowAddProductModal(false);
      setAddProductCode('');
      setAddProductName('');
      setAddProductBooks('');
      await fetchCatalog();
    } catch (err: any) {
      error(err.response?.data?.message || 'Product barcode add nahi ho paya');
    } finally {
      setIsAddingProduct(false);
    }
  };

  // Copy to clipboard
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    success(`"${code}" copy ho gaya!`);
  };

  // Open Edit Product Modal
  const handleOpenEditProduct = (p: ProductItem) => {
    setEditProductModal(p);
    setEditProductCode(p.productCode);
    setEditProductName(p.productName);
    setEditProductBooks(p.books.join(', '));
  };

  // Save Edit Product
  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProductModal) return;
    if (!editProductCode.trim()) {
      error('Product code zaroori hai');
      return;
    }
    if (!editProductName.trim()) {
      error('Product name zaroori hai');
      return;
    }

    const booksArr = editProductBooks
      .split(',')
      .map((b) => b.trim().toUpperCase())
      .filter(Boolean);

    setIsUpdatingProduct(true);
    try {
      const res = await api.put(`/stock/product/${encodeURIComponent(editProductModal.id)}`, {
        productCode: editProductCode.trim(),
        productName: editProductName.trim(),
        books: booksArr,
      });
      if (res.data?.success) {
        success(res.data?.message || 'Product successfully update ho gaya!');
        setEditProductModal(null);
        fetchCatalog();
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Product update karne me samasya aayi');
    } finally {
      setIsUpdatingProduct(false);
    }
  };

  const handleDeleteProduct = async (product: ProductItem) => {
    if (!window.confirm(
      `Kya aap "${product.productName}" (${product.productCode}) ko delete karna chahte hain? Is product se linked historical orders wale product ko delete nahi kiya ja sakta.`
    )) return;

    const key = `PRODUCT:${product.id}`;
    setDeletingBarcode(key);
    try {
      const res = await api.delete(`/stock/product/${encodeURIComponent(product.id)}`);
      success(res.data?.message || 'Product barcode deleted successfully');
      await fetchCatalog();
    } catch (err: any) {
      error(err.response?.data?.message || 'Product barcode delete nahi ho paya');
    } finally {
      setDeletingBarcode(null);
    }
  };

  // Open Edit Book Modal
  const handleOpenEditBook = (b: BookItem) => {
    setEditBookModal(b);
    setEditBookCode(b.bookCode);
    setEditBookName(b.bookName);
    setEditBookProductCode(b.productCode || '');
    setEditBookAvailableStock(String(b.availableQuantity ?? 0));
  };

  // Save Edit Book
  const handleSaveEditBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBookModal) return;
    if (!editBookCode.trim()) {
      error('Book code zaroori hai');
      return;
    }
    if (!editBookName.trim()) {
      error('Book name zaroori hai');
      return;
    }

    setIsUpdatingBook(true);
    try {
      const res = await api.put(`/stock/book/${encodeURIComponent(editBookModal.bookCode)}`, {
        bookCode: editBookCode.trim(),
        bookName: editBookName.trim(),
        productCode: editBookProductCode.trim(),
        availableQuantity: parseInt(editBookAvailableStock, 10),
      });
      if (res.data?.success) {
        success(res.data?.message || 'Book details successfully update ho gayi hain!');
        setEditBookModal(null);
        fetchCatalog();
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Book update karne me samasya aayi');
    } finally {
      setIsUpdatingBook(false);
    }
  };

  const handleDeleteBook = async (book: BookItem) => {
    if (!window.confirm(
      `Kya aap "${book.bookName}" (${book.bookCode}) ka barcode delete karna chahte hain? Iske liye stock balance 0 hona zaroori hai. Historical orders delete nahi honge.`
    )) return;

    const key = `BOOK:${book.bookCode}`;
    setDeletingBarcode(key);
    try {
      const res = await api.delete(`/stock/book/${encodeURIComponent(book.bookCode)}`);
      success(res.data?.message || 'Book barcode deleted successfully');
      await fetchCatalog();
    } catch (err: any) {
      error(err.response?.data?.message || 'Book barcode delete nahi ho paya');
    } finally {
      setDeletingBarcode(null);
    }
  };

  // Filtered Books
  const filteredBooks = books.filter((b) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      b.bookCode.toLowerCase().includes(q) ||
      b.bookName.toLowerCase().includes(q) ||
      (b.productCode && b.productCode.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (stockFilter === 'IN_STOCK') return b.availableQuantity > 0;
    if (stockFilter === 'OUT_OF_STOCK') return b.availableQuantity <= 0;
    return true;
  });

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.productCode.toLowerCase().includes(q) ||
      p.productName.toLowerCase().includes(q) ||
      p.books.some((b) => b.toLowerCase().includes(q))
    );
  });

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    try {
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Books
      const booksData = filteredBooks.map((b, idx) => ({
        'S.No': idx + 1,
        'Book Code (Barcode)': b.bookCode,
        'Book Title / Name': b.bookName,
        'Product Code': b.productCode || '-',
        'Available Stock': b.availableQuantity,
        'Pending Stock': b.pendingQuantity,
        'Total Inward': b.totalInward,
        'Total Dispatched': b.totalDispatched,
        'Status': b.availableQuantity > 0 ? 'IN STOCK' : 'OUT OF STOCK',
      }));
      const booksSheet = XLSX.utils.json_to_sheet(booksData);
      booksSheet['!cols'] = [
        { wch: 6 },
        { wch: 20 },
        { wch: 32 },
        { wch: 18 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(workbook, booksSheet, 'Book Barcodes');

      // Sheet 2: Products
      const productsData = filteredProducts.map((p, idx) => ({
        'S.No': idx + 1,
        'Product Code (Barcode)': p.productCode,
        'Product / Course Name': p.productName,
        'Books in Combo': p.books.join(', '),
        'Total Books Count': p.totalBooksCount,
        'Total Dispatch Orders': p.totalOrdersCount,
      }));
      const productsSheet = XLSX.utils.json_to_sheet(productsData);
      productsSheet['!cols'] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 32 },
        { wch: 36 },
        { wch: 16 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(workbook, productsSheet, 'Product Barcodes');

      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `Master_Product_and_Book_Barcodes_${dateStr}.xlsx`);
      success('Master Barcode Excel file download ho gayi hai!');
    } catch (err: any) {
      console.error('Export Error:', err);
      error('Excel export me samasya aayi.');
    }
  };

  // Print Barcode Stickers (5 Per Line / A4 Full Sheet - Zero Paper Waste)
  const handlePrintAllStickers = () => {
    // Prepare items to print based on active tab
    const itemsToPrint: Array<{ code: string; name: string }> = [];

    if (activeTab === 'ALL' || activeTab === 'PRODUCTS') {
      filteredProducts.forEach((p) => {
        itemsToPrint.push({
          code: p.productCode,
          name: p.productName,
        });
      });
    }

    if (activeTab === 'ALL' || activeTab === 'BOOKS') {
      filteredBooks.forEach((b) => {
        itemsToPrint.push({
          code: b.bookCode,
          name: b.bookName,
        });
      });
    }

    if (itemsToPrint.length === 0) {
      warning('Print karne ke liye koi barcodes nahi hain.');
      return;
    }

    // 🎯 If user searched / filtered to 1 single code (e.g. AFM05-02 / AFB05-02),
    // automatically fill the FULL A4 SHEET with 19 rows x 5 columns = 95 stickers so 0 paper is wasted!
    if (itemsToPrint.length === 1) {
      handlePrintSingleSticker(itemsToPrint[0].code, itemsToPrint[0].name, 95);
      return;
    }

    const win = window.open('', '_blank', 'width=1150,height=850');
    if (!win) {
      error('Popup window block ho gayi hai. Browser settings me popups allow karein.');
      return;
    }

    // Keep the barcode size unchanged and print the code and name on separate compact lines.
    const cardsHtml = itemsToPrint
      .map(
        (item) => `
      <div class="sticker-card">
        <div class="barcode-wrapper">
          <svg id="bc-${item.code.replace(/[^a-zA-Z0-9]/g, '_')}"></svg>
        </div>
        <div class="sticker-code">${item.code}</div>
        <div class="sticker-name" title="${item.name}">
          ${item.name}
        </div>
      </div>
    `
      )
      .join('');

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Master Barcode Stickers (A4 - 5 Per Line) - ${new Date().toLocaleDateString('en-IN')}</title>
          <!-- JsBarcode for crisp printing in new window -->
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <style>
            @page {
              size: A4 portrait;
              margin: 4mm 4mm;
            }
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              background: #0f172a;
              margin: 0;
              padding: 10px 0 25px 0;
              color: #0f172a;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            .no-print-bar {
              max-width: 210mm;
              margin: 0 auto 10px auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
              background: #1e293b;
              color: white;
              padding: 8px 14px;
              border-radius: 8px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            }
            .btn-print {
              background: #2563eb;
              color: white;
              border: none;
              padding: 7px 16px;
              border-radius: 6px;
              font-weight: 700;
              font-size: 13px;
              cursor: pointer;
            }
            .btn-print:hover { background: #1d4ed8; }
            .btn-close {
              background: #475569;
              color: white;
              border: none;
              padding: 7px 12px;
              border-radius: 6px;
              font-size: 12px;
              cursor: pointer;
              margin-left: 8px;
            }

            /* A4 Sheet Paper Preview (True A4 Portrait: 210mm x 297mm) */
            .a4-sheet {
              width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              background: white;
              padding: 4mm 4mm;
              box-shadow: 0 6px 20px rgba(0,0,0,0.35);
              border-radius: 2px;
              box-sizing: border-box;
            }

            /* ─── 5 Barcode Stickers Per Row, 18-19 Rows Per Column (Ultra Compact) ─── */
            .sticker-grid {
              display: grid;
              grid-template-columns: repeat(5, 1fr);
              gap: 0.8mm 1.5mm;
              width: 100%;
            }

            .sticker-card {
              border: 1px dashed #94a3b8;
              border-radius: 2px;
              padding: 1px 1.5px;
              background: white;
              text-align: center;
              page-break-inside: avoid;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 14.2mm;
              overflow: hidden;
              box-sizing: border-box;
            }

            .barcode-wrapper {
              width: 100%;
              line-height: 0;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .barcode-wrapper svg {
              max-width: 98%;
              height: 24px;
              display: block;
              margin: 0 auto;
            }

            .sticker-code {
              display: block !important;
              flex: 0 0 auto;
              font-size: 9px;
              font-weight: 400;
              color: #0f172a;
              line-height: 1;
              margin-top: 1px;
              text-align: center;
              width: 100%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              padding: 0 1px;
            }
            .sticker-name {
              display: block !important;
              flex: 0 0 auto;
              font-size: 9px;
              font-weight: 400;
              color: #334155;
              line-height: 1;
              text-align: center;
              width: 100%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              padding: 0 1px;
            }

            @media print {
              .no-print-bar { display: none !important; }
              body { background: white !important; padding: 0 !important; margin: 0 !important; }
              .a4-sheet {
                width: 100% !important;
                min-height: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                box-shadow: none !important;
              }
              .sticker-card { border: 1px solid #475569 !important; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar">
            <div>
              <strong style="color: #38bdf8; font-size: 13px;">🏷️ Barcode Stickers (${itemsToPrint.length} Items - A4 5 Per Line)</strong>
              <span style="font-size: 12px; margin-left: 8px; color: #cbd5e1;">
                💡 1 Column me 18-19 Scanners | 'Destination' me <strong>"Save as PDF"</strong> chunein.
              </span>
            </div>
            <div>
              <button onclick="window.print()" class="btn-print">🖨️ Print / Save as PDF</button>
              <button onclick="window.close()" class="btn-close">✕ Close</button>
            </div>
          </div>

          <div class="a4-sheet">
            <div class="sticker-grid">
              ${cardsHtml}
            </div>
          </div>

          <script>
            const items = ${JSON.stringify(itemsToPrint)};
            items.forEach(it => {
              const elId = '#bc-' + it.code.replace(/[^a-zA-Z0-9]/g, '_');
              try {
                JsBarcode(elId, it.code, {
                  format: "CODE128",
                  width: 1.15,
                  height: 22,
                  margin: 0,
                  displayValue: false
                });
              } catch(e) {}
            });

            setTimeout(() => {
              window.print();
            }, 600);
          </script>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
  };

  // Print Single Barcode Sticker - Fills Full A4 Page (95 stickers, 19 rows x 5 columns, Ultra Compact)
  const handlePrintSingleSticker = (code: string, name: string, defaultCount: number = 95) => {
    const win = window.open('', '_blank', 'width=1150,height=850');
    if (!win) {
      error('Popup window block ho gayi hai. Browser settings me popups allow karein.');
      return;
    }

    const initialCount = defaultCount;
    // Pre-generate 95 sticker cards in the initial HTML so they appear immediately!
    let cardsHtml = '';
    for (let i = 0; i < initialCount; i++) {
      cardsHtml += `
        <div class="sticker-card">
          <div class="barcode-wrapper">
            <svg id="bc-single-${i}"></svg>
          </div>
          <div class="sticker-code">${code}</div>
          <div class="sticker-name" title="${name}">${name}</div>
        </div>
      `;
    }

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>A4 Barcode Stickers (19 Scanners/Col - 95 Full Sheet) - ${code}</title>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <style>
            @page {
              size: A4 portrait;
              margin: 4mm 4mm;
            }
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              background: #0f172a;
              margin: 0;
              padding: 10px 0 25px 0;
              color: #0f172a;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .no-print-bar {
              max-width: 210mm;
              margin: 0 auto 10px auto;
              display: flex;
              flex-wrap: wrap;
              justify-content: space-between;
              align-items: center;
              background: #1e293b;
              color: white;
              padding: 8px 14px;
              border-radius: 8px;
              gap: 8px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            }
            .bar-left {
              display: flex;
              align-items: center;
              gap: 10px;
              flex-wrap: wrap;
            }
            .bar-title {
              font-size: 13px;
              font-weight: 700;
              color: #38bdf8;
            }
            .qty-group {
              display: flex;
              align-items: center;
              gap: 5px;
              font-size: 12px;
              color: #cbd5e1;
            }
            .qty-btn {
              background: #334155;
              color: white;
              border: 1px solid #475569;
              padding: 4px 9px;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
            }
            .qty-btn:hover, .qty-btn.active {
              background: #2563eb;
              border-color: #3b82f6;
            }
            .qty-input {
              width: 52px;
              padding: 3px 5px;
              border-radius: 4px;
              border: 1px solid #64748b;
              background: #0f172a;
              color: white;
              font-size: 12px;
              text-align: center;
            }
            .btn-print {
              background: #2563eb;
              color: white;
              border: none;
              padding: 7px 16px;
              border-radius: 6px;
              font-weight: 700;
              font-size: 13px;
              cursor: pointer;
            }
            .btn-print:hover {
              background: #1d4ed8;
            }
            .btn-close {
              background: #475569;
              color: white;
              border: none;
              padding: 7px 12px;
              border-radius: 6px;
              font-size: 12px;
              cursor: pointer;
              margin-left: 8px;
            }
            .btn-close:hover {
              background: #334155;
            }

            /* A4 Sheet Paper Preview (210mm x 297mm) */
            .a4-sheet {
              width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              background: white;
              padding: 4mm 4mm;
              box-shadow: 0 6px 20px rgba(0,0,0,0.35);
              border-radius: 2px;
              box-sizing: border-box;
            }

            /* ─── 5 Barcode Stickers Per Row x 18-19 Rows (Ultra Compact - Zero Waste) ─── */
            .sticker-grid {
              display: grid;
              grid-template-columns: repeat(5, 1fr);
              gap: 0.8mm 1.5mm;
              width: 100%;
            }

            .sticker-card {
              border: 1px dashed #94a3b8;
              border-radius: 2px;
              padding: 1px 1.5px;
              background: white;
              text-align: center;
              page-break-inside: avoid;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 14.2mm;
              overflow: hidden;
              box-sizing: border-box;
            }

            .barcode-wrapper {
              width: 100%;
              line-height: 0;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .barcode-wrapper svg {
              max-width: 98%;
              height: 24px;
              display: block;
              margin: 0 auto;
            }

            .sticker-code {
              display: block !important;
              flex: 0 0 auto;
              font-size: 9px;
              font-weight: 400;
              color: #0f172a;
              line-height: 1;
              margin-top: 1px;
              text-align: center;
              width: 100%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              padding: 0 1px;
            }
            .sticker-name {
              display: block !important;
              flex: 0 0 auto;
              font-size: 9px;
              font-weight: 400;
              color: #334155;
              line-height: 1;
              text-align: center;
              width: 100%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              padding: 0 1px;
            }

            @media print {
              .no-print-bar { display: none !important; }
              body { background: white !important; padding: 0 !important; margin: 0 !important; }
              .a4-sheet {
                width: 100% !important;
                min-height: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                box-shadow: none !important;
              }
              .sticker-card { border: 1px solid #475569 !important; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar">
            <div class="bar-left">
              <span class="bar-title">🏷️ ${code} (1 Col = 19 Scanners | 95 Total)</span>
              <div class="qty-group">
                <span>Stickers:</span>
                <button type="button" class="qty-btn ${initialCount === 95 ? 'active' : ''}" onclick="changeCount(95)">1 Sheet (19 Rows = 95)</button>
                <button type="button" class="qty-btn ${initialCount === 90 ? 'active' : ''}" onclick="changeCount(90)">18 Rows (90)</button>
                <button type="button" class="qty-btn ${initialCount === 190 ? 'active' : ''}" onclick="changeCount(190)">2 Sheets (190)</button>
                <button type="button" class="qty-btn ${initialCount === 45 ? 'active' : ''}" onclick="changeCount(45)">Half (45)</button>
                <input type="number" id="qty-box" class="qty-input" value="${initialCount}" min="1" max="500" onchange="changeCount(this.value)" />
              </div>
            </div>
            <div>
              <button onclick="window.print()" class="btn-print">🖨️ Print / Save as PDF</button>
              <button onclick="window.close()" class="btn-close">✕ Close</button>
            </div>
          </div>

          <div class="a4-sheet">
            <div class="sticker-grid" id="grid">
              ${cardsHtml}
            </div>
          </div>

          <script>
            const code = ${JSON.stringify(code)};
            const name = ${JSON.stringify(name)};

            function renderBarcodes(count) {
              for (let i = 0; i < count; i++) {
                try {
                  JsBarcode('#bc-single-' + i, code, {
                    format: "CODE128",
                    width: 1.15,
                    height: 22,
                    margin: 0,
                    displayValue: false
                  });
                } catch(e) {}
              }
            }

            function changeCount(val) {
              const count = parseInt(val) || 95;
              document.getElementById('qty-box').value = count;
              document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('active'));
              if (count === 95) document.querySelectorAll('.qty-btn')[0]?.classList.add('active');
              if (count === 90) document.querySelectorAll('.qty-btn')[1]?.classList.add('active');
              if (count === 190) document.querySelectorAll('.qty-btn')[2]?.classList.add('active');
              if (count === 45) document.querySelectorAll('.qty-btn')[3]?.classList.add('active');

              const grid = document.getElementById('grid');
              let html = '';
              for (let i = 0; i < count; i++) {
                html += \`
                  <div class="sticker-card">
                    <div class="barcode-wrapper">
                      <svg id="bc-single-\${i}"></svg>
                    </div>
                    <div class="sticker-code">\${code}</div>
                    <div class="sticker-name" title="\${name}">\${name}</div>
                  </div>
                \`;
              }
              grid.innerHTML = html;
              renderBarcodes(count);
            }

            // Render all initial barcodes immediately
            renderBarcodes(${initialCount});

            setTimeout(() => {
              window.print();
            }, 600);
          </script>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
  };

  const totalItemsCount = books.length + products.length;

  return (
    <div className="space-y-5">
      {/* ─── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Barcode size={26} className="text-red-600" />
              <span>Barcode Directory & Labels (प्रोडक्ट व बुक बारकोड कैटलॉग)</span>
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
              Master Barcodes
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            यहाँ आपके सभी Products (`AFMEO-002`, `AFON-002`...) और Books (`AF-01`, `AF-02`...) के बारकोड उपलब्ध हैं। आप इन्हें देख सकते हैं, बारकोड गन से टेस्ट कर सकते हैं, और स्टिकर / PDF / Excel के रूप में डाउनलोड व प्रिंट कर सकते हैं।
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Export Excel (.xlsx) Button */}
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
            title="Download full barcode directory as Excel (.xlsx)"
          >
            <Download size={14} />
            <span>Export Excel (.xlsx)</span>
          </button>

          {/* Print All Barcodes Button */}
          <button
            onClick={handlePrintAllStickers}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
            title="Print Barcode Labels Grid / Save as PDF"
          >
            <Printer size={14} />
            <span>Print Stickers (PDF)</span>
          </button>
        </div>
      </div>

      {/* ─── Live Barcode Tester & Scanner Box ─────────────────────────────────── */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-rose-950 to-red-950 text-white shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-amber-400" />
              <span className="text-sm font-bold tracking-wide text-red-200">
                Live Barcode Preview & Gun Tester (बारकोड परीक्षक)
              </span>
            </div>
            <p className="text-xs text-slate-300">
              कोई भी Product Code या Book Code यहाँ टाइप करें या बारकोड गन से स्कैन करें — तुरंत उसका बारकोड स्टिकर दिखेगा:
            </p>
          </div>

          <div className="flex items-center gap-2 max-w-md w-full">
            <input
              type="text"
              value={testerInput}
              onChange={(e) => setTesterInput(e.target.value.toUpperCase())}
              placeholder="e.g. AFMEO-002, AF-01, AFON-002..."
              className="flex-1 px-3.5 py-2 rounded-lg bg-white text-slate-900 font-mono font-bold text-xs uppercase focus:outline-none focus:ring-2 focus:ring-red-400 shadow-inner"
            />
            {testerInput && (
              <button
                onClick={() => setTesterInput('')}
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Live Tested Barcode Display */}
        {testerInput && (
          <div className="mt-3 p-3 bg-white rounded-lg text-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-4">
              <div className="p-1 bg-slate-50 border border-slate-200 rounded">
                <BarcodeDisplay value={testerInput} height={42} width={1.6} fontSize={11} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                  Live Preview
                </span>
                <p className="font-mono font-black text-lg text-slate-900 mt-1">{testerInput}</p>
                <p className="text-xs text-slate-500">Scannable Code128 Barcode</p>
              </div>
            </div>

            <button
              onClick={() => handlePrintSingleSticker(testerInput, testerInput)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Printer size={13} />
              <span>Print This Barcode Sticker</span>
            </button>
          </div>
        )}
      </div>

      {/* ─── Tabs & Controls Bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Layers size={13} />
            <span>All Barcodes ({totalItemsCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('BOOKS')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'BOOKS' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-800 hover:bg-red-100'
            }`}
          >
            <BookOpen size={13} />
            <span>Book Barcodes ({books.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('PRODUCTS')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'PRODUCTS' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
            }`}
          >
            <Package size={13} />
            <span>Product Barcodes ({products.length})</span>
          </button>
        </div>

        {/* Add barcode actions, search & layout toggle */}
        <div className="flex items-center gap-2">
          {isAdmin && (activeTab === 'ALL' || activeTab === 'BOOKS') && (
            <button
              type="button"
              onClick={() => setShowAddBookModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold whitespace-nowrap"
            >
              <Plus size={13} />
              Add Book Code
            </button>
          )}
          {isAdmin && (activeTab === 'ALL' || activeTab === 'PRODUCTS') && (
            <>
              <button
                type="button"
                onClick={() => setShowAddProductModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold whitespace-nowrap cursor-pointer shadow-2xs"
              >
                <Plus size={13} />
                Add Product Code
              </button>
              <button
                type="button"
                onClick={() => setShowBulkProductModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap cursor-pointer shadow-2xs transition-colors"
                title="Upload Products & Book Barcodes via Excel (.xlsx)"
              >
                <FileSpreadsheet size={13} />
                <span>Upload Excel</span>
              </button>
            </>
          )}
          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search code, book, product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 w-56"
            />
          </div>

          {/* Stock filter (visible when on books tab or all) */}
          {(activeTab === 'ALL' || activeTab === 'BOOKS') && (
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-medium text-slate-700 cursor-pointer focus:outline-none"
            >
              <option value="ALL">All Stock Status</option>
              <option value="IN_STOCK">In Stock Only</option>
              <option value="OUT_OF_STOCK">Zero Stock (0)</option>
            </select>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setViewMode('GRID')}
              className={`p-1.5 rounded transition-all cursor-pointer ${
                viewMode === 'GRID' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Sticker Grid View"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('TABLE')}
              className={`p-1.5 rounded transition-all cursor-pointer ${
                viewMode === 'TABLE' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Compact Table View"
            >
              <LayoutList size={14} />
            </button>
          </div>

          <button
            onClick={fetchCatalog}
            className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ─── MAIN CONTENT ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500">Barcode Directory load ho rahi hai...</p>
        </div>
      ) : (
        <div ref={printAreaRef} className="space-y-6">
          {/* SECTION 1: PRODUCT BARCODES */}
          {(activeTab === 'ALL' || activeTab === 'PRODUCTS') && filteredProducts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package size={18} className="text-indigo-600" />
                  <h2 className="text-base font-bold text-slate-900">
                    Product / Course Barcodes ({filteredProducts.length})
                  </h2>
                </div>
                <span className="text-xs text-slate-500">
                  Used for complete student order bundles
                </span>
              </div>

              {viewMode === 'GRID' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 transition-all shadow-2xs hover:shadow-sm flex flex-col justify-between space-y-2.5"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {p.productCode}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {p.totalBooksCount} Books
                          </span>
                        </div>

                        {/* Barcode SVG */}
                        <div className="bg-slate-50/60 p-2 rounded-lg border border-slate-200/80 flex items-center justify-center">
                          <BarcodeDisplay value={p.productCode} height={40} width={1.4} fontSize={10} />
                        </div>

                        <div>
                          <h3 className="font-bold text-slate-900 text-xs leading-snug line-clamp-2">
                            {p.productName}
                          </h3>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {p.books.map((b) => (
                              <span
                                key={b}
                                className="text-[9.5px] font-mono font-semibold px-1 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200"
                              >
                                {b}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <button
                          onClick={() => handleCopy(p.productCode)}
                          className="text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer text-[11px]"
                        >
                          {copiedCode === p.productCode ? (
                            <>
                              <Check size={12} className="text-emerald-600" />
                              <span className="text-emerald-600 font-bold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditProduct(p)}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded flex items-center gap-1 cursor-pointer transition-colors text-[11px]"
                            title="Edit Product Code & Course Name"
                          >
                            <Edit3 size={11} />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p)}
                            disabled={deletingBarcode === `PRODUCT:${p.id}`}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded flex items-center gap-1 cursor-pointer transition-colors text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete Product Barcode"
                          >
                            <Trash2 size={11} />
                            <span>{deletingBarcode === `PRODUCT:${p.id}` ? 'Deleting...' : 'Delete'}</span>
                          </button>
                          <button
                            onClick={() => handlePrintSingleSticker(p.productCode, p.productName)}
                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded flex items-center gap-1 cursor-pointer transition-colors text-[11px]"
                          >
                            <Printer size={11} />
                            <span>Print</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Product Table View */
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white uppercase text-[10.5px] tracking-wider font-bold">
                        <th className="py-3 px-3 text-center w-40">Barcode Sticker</th>
                        <th className="py-3 px-3">Product Code</th>
                        <th className="py-3 px-3">Course Name</th>
                        <th className="py-3 px-3">Books in Bundle</th>
                        <th className="py-3 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.map((p) => (
                        <tr key={p.id} className="hover:bg-indigo-50/30">
                          <td className="py-2 px-3 text-center">
                            <div className="inline-block p-1 bg-white rounded border border-slate-200">
                              <BarcodeDisplay value={p.productCode} height={32} width={1.3} fontSize={9} />
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                            {p.productCode}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800 max-w-xs">
                            {p.productName}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {p.books.map((b) => (
                                <span
                                  key={b}
                                  className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEditProduct(p)}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded inline-flex items-center gap-1 cursor-pointer"
                                title="Edit Product Code & Course Name"
                              >
                                <Edit3 size={12} />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(p)}
                                disabled={deletingBarcode === `PRODUCT:${p.id}`}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete Product Barcode"
                              >
                                <Trash2 size={12} />
                                <span>{deletingBarcode === `PRODUCT:${p.id}` ? 'Deleting...' : 'Delete'}</span>
                              </button>
                              <button
                                onClick={() => handlePrintSingleSticker(p.productCode, p.productName)}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Printer size={12} />
                                <span>Print</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: BOOK BARCODES */}
          {(activeTab === 'ALL' || activeTab === 'BOOKS') && filteredBooks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen size={18} className="text-red-600" />
                  <h2 className="text-base font-bold text-slate-900">
                    Individual Book Barcodes ({filteredBooks.length})
                  </h2>
                </div>
                <span className="text-xs text-slate-500">
                  Stickered onto physical books for scanner gun verification
                </span>
              </div>

              {viewMode === 'GRID' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredBooks.map((b) => {
                    const isInStock = b.availableQuantity > 0;

                    return (
                      <div
                        key={b.bookCode}
                        className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-red-300 transition-all shadow-2xs hover:shadow-sm flex flex-col justify-between space-y-2.5"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                              {b.bookCode}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                                isInStock
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                            >
                              {isInStock ? `${b.availableQuantity} in stock` : b.availableQuantity < 0 ? `${b.availableQuantity} deficit` : '0 stock'}
                            </span>
                          </div>

                          {/* Barcode SVG */}
                          <div className="bg-slate-50/60 p-2 rounded-lg border border-slate-200/80 flex items-center justify-center">
                            <BarcodeDisplay value={b.bookCode} height={40} width={1.4} fontSize={10} />
                          </div>

                          <div>
                            <h3 className="font-bold text-slate-900 text-xs leading-snug line-clamp-2">
                              {b.bookName}
                            </h3>
                            {b.productCode && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Combo: <strong className="font-mono text-slate-600">{b.productCode}</strong>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Card Footer Actions */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <button
                            onClick={() => handleCopy(b.bookCode)}
                            className="text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer text-[11px]"
                          >
                            {copiedCode === b.bookCode ? (
                              <>
                                <Check size={12} className="text-emerald-600" />
                                <span className="text-emerald-600 font-bold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditBook(b)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded flex items-center gap-1 cursor-pointer transition-colors text-[11px]"
                              title="Edit Book Code & Book Name"
                            >
                              <Edit3 size={11} />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteBook(b)}
                              disabled={deletingBarcode === `BOOK:${b.bookCode}`}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded flex items-center gap-1 cursor-pointer transition-colors text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete Book Barcode"
                            >
                              <Trash2 size={11} />
                              <span>{deletingBarcode === `BOOK:${b.bookCode}` ? 'Deleting...' : 'Delete'}</span>
                            </button>
                            <button
                              onClick={() => handlePrintSingleSticker(b.bookCode, b.bookName)}
                              className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded flex items-center gap-1 cursor-pointer transition-colors text-[11px]"
                            >
                              <Printer size={11} />
                              <span>Print</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Book Table View */
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white uppercase text-[10.5px] tracking-wider font-bold">
                        <th className="py-3 px-3 text-center w-40">Barcode Sticker</th>
                        <th className="py-3 px-3">Book Code</th>
                        <th className="py-3 px-3">Book Name</th>
                        <th className="py-3 px-3">Product Combo</th>
                        <th className="py-3 px-3 text-center">Available Stock</th>
                        <th className="py-3 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredBooks.map((b) => (
                        <tr key={b.bookCode} className="hover:bg-red-50/30">
                          <td className="py-2 px-3 text-center">
                            <div className="inline-block p-1 bg-white rounded border border-slate-200">
                              <BarcodeDisplay value={b.bookCode} height={32} width={1.3} fontSize={9} />
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-red-700">
                            {b.bookCode}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {b.bookName}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {b.productCode || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                b.availableQuantity > 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {b.availableQuantity}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEditBook(b)}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded inline-flex items-center gap-1 cursor-pointer"
                                title="Edit Book Code & Book Name"
                              >
                                <Edit3 size={12} />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDeleteBook(b)}
                                disabled={deletingBarcode === `BOOK:${b.bookCode}`}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete Book Barcode"
                              >
                                <Trash2 size={12} />
                                <span>{deletingBarcode === `BOOK:${b.bookCode}` ? 'Deleting...' : 'Delete'}</span>
                              </button>
                              <button
                                onClick={() => handlePrintSingleSticker(b.bookCode, b.bookName)}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Printer size={12} />
                                <span>Print</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {filteredBooks.length === 0 && filteredProducts.length === 0 && (
            <div className="py-16 text-center bg-white rounded-xl border border-slate-200 p-8 space-y-3">
              <Barcode size={36} className="mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">Koi barcode match nahi hua</p>
              <p className="text-xs text-slate-400">
                Search term badal kar dekhein ya upar custom barcode tester use karein.
              </p>
            </div>
          )}
        </div>
      )}

      {showAddBookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <form onSubmit={handleAddBook} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Book Barcode</h3>
                <p className="text-xs text-slate-500">Book code aur name add karein. Initial stock 0 rahega.</p>
              </div>
              <button type="button" onClick={() => setShowAddBookModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Book Code *
              <input
                value={addBookCode}
                onChange={(e) => setAddBookCode(e.target.value.toUpperCase())}
                required
                maxLength={50}
                placeholder="e.g. AF-01"
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Book Name *
              <input
                value={addBookName}
                onChange={(e) => setAddBookName(e.target.value)}
                required
                maxLength={200}
                placeholder="Book title"
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Product Code (optional)
              <input
                value={addBookProductCode}
                onChange={(e) => setAddBookProductCode(e.target.value.toUpperCase())}
                maxLength={50}
                placeholder="e.g. AFBFL-002"
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setShowAddBookModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">
                Cancel
              </button>
              <button type="submit" disabled={isAddingBook} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                {isAddingBook ? 'Adding...' : 'Add Book Barcode'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <form onSubmit={handleAddProduct} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Product Barcode</h3>
                <p className="text-xs text-slate-500">Product code aur course name add karein.</p>
              </div>
              <button type="button" onClick={() => setShowAddProductModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Product Code *
              <input
                value={addProductCode}
                onChange={(e) => setAddProductCode(e.target.value.toUpperCase())}
                required
                maxLength={50}
                placeholder="e.g. AFBFL-002"
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Product / Course Name *
              <input
                value={addProductName}
                onChange={(e) => setAddProductName(e.target.value)}
                required
                maxLength={200}
                placeholder="Course bundle name"
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Included Book Codes (optional, comma separated)
              <input
                value={addProductBooks}
                onChange={(e) => setAddProductBooks(e.target.value.toUpperCase())}
                placeholder="AF-01, AF-02"
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setShowAddProductModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">
                Cancel
              </button>
              <button type="submit" disabled={isAddingProduct} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                {isAddingProduct ? 'Adding...' : 'Add Product Barcode'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Edit Product Modal ─────────────────────────────────────────────── */}
      {editProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Product / Course Barcode (प्रोडक्ट विवरण बदलें)</h3>
                  <p className="text-xs text-slate-500">
                    Product Code ya Course Name update karein
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditProductModal(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditProduct} className="space-y-3.5">
              {/* Product Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Product / Course Code (प्रोडक्ट कोड) *
                </label>
                <input
                  type="text"
                  value={editProductCode}
                  onChange={(e) => setEditProductCode(e.target.value.toUpperCase())}
                  placeholder="e.g. AFB05-02, AFMEO-002..."
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase bg-indigo-50/40"
                />
                <span className="text-[10px] text-slate-400">Yeh code barcode scan & order bundles me use hota hai</span>
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Product / Course Name (कोर्स का नाम) *
                </label>
                <input
                  type="text"
                  value={editProductName}
                  onChange={(e) => setEditProductName(e.target.value)}
                  placeholder="e.g. AFM Outscanner Multi-Colour QB"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Books in Bundle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Books in Bundle (इस कॉम्बो में शामिल किताबें - कॉमा से अलग करें)
                </label>
                <input
                  type="text"
                  value={editProductBooks}
                  onChange={(e) => setEditProductBooks(e.target.value.toUpperCase())}
                  placeholder="e.g. AF051-002, AF052-002"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                />
                <span className="text-[10px] text-slate-400">Example: AF051-002, AF052-002 (comma separated)</span>
              </div>

              {/* Live Barcode Preview */}
              {editProductCode.trim() && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Live Preview:</span>
                  <div className="bg-white px-2 py-1 rounded border border-slate-200">
                    <BarcodeDisplay value={editProductCode.trim()} height={30} width={1.2} fontSize={9} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isUpdatingProduct}
                  onClick={() => setEditProductModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel (रद्द करें)
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingProduct}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingProduct ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Edit3 size={13} />
                      <span>Save Changes (अपडेट करें)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Book Modal ────────────────────────────────────────────────── */}
      {editBookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Book Barcode (किताब विवरण बदलें)</h3>
                  <p className="text-xs text-slate-500">
                    Book Code, Title ya Combo details update karein
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditBookModal(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditBook} className="space-y-3.5">
              {/* Book Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Book Code / Barcode (किताब बारकोड कोड) *
                </label>
                <input
                  type="text"
                  value={editBookCode}
                  onChange={(e) => setEditBookCode(e.target.value.toUpperCase())}
                  placeholder="e.g. AF-01, DTSM-002..."
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 uppercase bg-red-50/40"
                />
                <span className="text-[10px] text-slate-400">Yeh code book sticker aur scanner gun se scan karne me use hota hai</span>
              </div>

              {/* Book Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Book Name / Title (किताब का नाम) *
                </label>
                <input
                  type="text"
                  value={editBookName}
                  onChange={(e) => setEditBookName(e.target.value)}
                  placeholder="e.g. Audit Regular Book"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Product Combo Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Associated Product Combo (किस कोर्स कॉम्बो की किताब है - ऑप्शनल)
                </label>
                <input
                  type="text"
                  value={editBookProductCode}
                  onChange={(e) => setEditBookProductCode(e.target.value.toUpperCase())}
                  placeholder="e.g. AFB05-02, AFMEO-002..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 uppercase"
                />
              </div>

              {/* Available Stock */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Available Stock (उपलब्ध स्टॉक)
                </label>
                <input
                  type="number"
                  min="0"
                  value={editBookAvailableStock}
                  onChange={(e) => setEditBookAvailableStock(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Live Barcode Preview */}
              {editBookCode.trim() && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Live Preview:</span>
                  <div className="bg-white px-2 py-1 rounded border border-slate-200">
                    <BarcodeDisplay value={editBookCode.trim()} height={30} width={1.2} fontSize={9} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isUpdatingBook}
                  onClick={() => setEditBookModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel (रद्द करें)
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingBook}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingBook ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Edit3 size={13} />
                      <span>Save Changes (अपडेट करें)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Bulk Product & Books Excel Upload Modal ───────────────────── */}
      <ProductExcelUploadModal
        isOpen={showBulkProductModal}
        onClose={() => setShowBulkProductModal(false)}
        onSuccess={fetchCatalog}
      />
    </div>
  );
};

export default BarcodeCatalogPage;
