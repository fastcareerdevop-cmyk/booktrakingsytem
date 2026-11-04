import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Package,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  Search,
  ScanLine,
  RefreshCw,
  Play,
  Barcode,
  Volume2,
  VolumeX,
  X,
  ShieldCheck,
  Zap,
  Check,
  BookOpen,
  SlidersHorizontal,
  PackageCheck,
  Pencil,
  Trash2,
} from 'lucide-react';
import api from '../../services/api';
import {
  playSuccessChime,
  playErrorTone,
  playOrderCompleteFanfare,
  speakVoiceAnnouncement,
  speakErrorMessage,
} from '../../utils/sound';

interface BookItem {
  bookCode: string;
  bookName: string;
  availableQuantity: number;
}

interface PreparationProduct {
  id?: string;
  productCode: string;
  productName: string;
  books: BookItem[];
  totalBooksCount: number;
  packagedStock: number;
  shelfStock: number;
  totalAvailableStock: number;
  totalBatchesPacked: number;
  packableSets?: number;
  lastPackedAt?: string;
}

export const PreparationPage: React.FC = () => {
  const [products, setProducts] = useState<PreparationProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PACKAGED' | 'UNPACKAGED' | 'SHELF_AVAILABLE' | 'SHELF_EMPTY'>('ALL');
  const [sortBy, setSortBy] = useState<'CODE_ASC' | 'NAME_ASC' | 'PACKAGED_DESC' | 'SHELF_DESC' | 'TOTAL_DESC'>('CODE_ASC');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Live Warehouse Stock Summary (Shelf vs Packaged)
  const [stockSummary, setStockSummary] = useState({
    totalAvailableStock: 0,
    shelfStock: 0,
    packagedStock: 0,
    packagedBooksCount: 0,
  });

  // Active Packaging Modal State
  const [activeProduct, setActiveProduct] = useState<PreparationProduct | null>(null);
  const [isPackingModalOpen, setIsPackingModalOpen] = useState(false);
  const [targetQuantity, setTargetQuantity] = useState<number>(0);
  const [quantityInput, setQuantityInput] = useState<string>('');
  const [packagingPhase, setPackagingPhase] = useState<'SELECT_QTY' | 'SCANNING' | 'COMPLETED'>('SELECT_QTY');

  // Scanning Progress State
  const [currentPackageNum, setCurrentPackageNum] = useState<number>(1);
  const [currentBookIndex, setCurrentBookIndex] = useState<number>(0);
  const [completedPackagesCount, setCompletedPackagesCount] = useState<number>(0);
  const [scannedHistory, setScannedHistory] = useState<{ packageNum: number; bookCode: string; bookName: string }[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  // Edit Packaged Stock Modal State
  const [editingProduct, setEditingProduct] = useState<PreparationProduct | null>(null);
  const [editStockValue, setEditStockValue] = useState<string>('0');
  const [isSavingStockEdit, setIsSavingStockEdit] = useState(false);

  const scanInputRef = useRef<HTMLInputElement>(null);

  // Fetch all products & warehouse stock summary
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const [productsRes, summaryRes] = await Promise.all([
        api.get('/preparation/products'),
        api.get('/preparation/stock-summary'),
      ]);

      if (productsRes.data.success) {
        setProducts(productsRes.data.data.products || []);
      }
      if (summaryRes.data.success) {
        const sumData = summaryRes.data.data;
        const totalAvail = sumData.totalAvailableStock || 0;
        const shelf = sumData.shelfStock || 0;
        const pkgBooks = sumData.packagedBooksCount !== undefined
          ? sumData.packagedBooksCount
          : Math.max(0, totalAvail - shelf);

        setStockSummary({
          totalAvailableStock: totalAvail,
          shelfStock: shelf,
          packagedStock: sumData.packagedStock || 0,
          packagedBooksCount: pkgBooks,
        });
      }
    } catch (err) {
      console.error('Failed to load preparation products & stock summary:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Filter & sort products list
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return products
      .filter((p) => {
        // Search filter
        const matchesQuery =
          !query ||
          p.productCode.toLowerCase().includes(query) ||
          p.productName.toLowerCase().includes(query) ||
          p.books.some(
            (b) =>
              b.bookCode.toLowerCase().includes(query) ||
              b.bookName.toLowerCase().includes(query)
          );

        if (!matchesQuery) return false;

        // Status filter
        if (statusFilter === 'PACKAGED') return p.packagedStock > 0;
        if (statusFilter === 'UNPACKAGED') return p.packagedStock === 0;
        if (statusFilter === 'SHELF_AVAILABLE') return p.shelfStock > 0;
        if (statusFilter === 'SHELF_EMPTY') return p.shelfStock === 0;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'NAME_ASC') return a.productName.localeCompare(b.productName);
        if (sortBy === 'PACKAGED_DESC') return b.packagedStock - a.packagedStock;
        if (sortBy === 'SHELF_DESC') return b.shelfStock - a.shelfStock;
        if (sortBy === 'TOTAL_DESC') return b.totalAvailableStock - a.totalAvailableStock;
        // Default CODE_ASC
        const codeCmp = a.productCode.localeCompare(b.productCode, undefined, { numeric: true });
        if (codeCmp !== 0) return codeCmp;
        return a.productName.localeCompare(b.productName);
      });
  }, [products, searchQuery, statusFilter, sortBy]);

  // Open Edit Packaged Stock Modal
  const handleOpenEditStock = (product: PreparationProduct) => {
    setEditingProduct(product);
    setEditStockValue(String(product.packagedStock || 0));
  };

  // Save Packaged Stock Edit
  const handleSaveStockEdit = async () => {
    if (!editingProduct) return;
    const parsed = parseInt(editStockValue, 10);
    const newQty = isNaN(parsed) || parsed < 0 ? 0 : parsed;

    setIsSavingStockEdit(true);
    try {
      const res = await api.post('/preparation/update-stock', {
        productCode: editingProduct.productCode,
        productName: editingProduct.productName,
        packagedStock: newQty,
      });

      if (res.data.success) {
        if (soundEnabled) playSuccessChime();
        setProducts((prev) =>
          prev.map((p) => {
            const isMatch = editingProduct.id
              ? p.id === editingProduct.id
              : p.productCode === editingProduct.productCode && p.productName === editingProduct.productName;
            if (!isMatch) return p;
            const maxSets = p.packableSets ?? (p.shelfStock + p.packagedStock);
            const updatedShelf = Math.max(0, maxSets - newQty);
            return {
              ...p,
              packagedStock: newQty,
              shelfStock: updatedShelf,
              totalAvailableStock: updatedShelf + newQty,
            };
          })
        );
        setEditingProduct(null);
        fetchProducts();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update packaged stock');
    } finally {
      setIsSavingStockEdit(false);
    }
  };

  // Reset / Delete Packaged Stock to 0
  const handleDeletePackagedStock = async (product: PreparationProduct) => {
    if ((product.packagedStock || 0) <= 0) return;

    const confirmed = window.confirm(
      `"${product.productCode}" (${product.productName}) ke sabhi ${product.packagedStock} ready package delete / 0 karna chahte hain? Yeh books wapas shelf stock me count hongi.`
    );
    if (!confirmed) return;

    try {
      const res = await api.post('/preparation/reset-stock', {
        productCode: product.productCode,
        productName: product.productName,
      });

      if (res.data.success) {
        if (soundEnabled) playSuccessChime();
        setProducts((prev) =>
          prev.map((p) => {
            const isMatch = product.id
              ? p.id === product.id
              : p.productCode === product.productCode && p.productName === product.productName;
            if (!isMatch) return p;
            const restoredShelf = p.packableSets ?? (p.shelfStock + p.packagedStock);
            return {
              ...p,
              packagedStock: 0,
              shelfStock: restoredShelf,
              totalAvailableStock: restoredShelf,
            };
          })
        );
        fetchProducts();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to reset packaged stock');
    }
  };

  // Open Packing Station for a product
  const handleStartPackaging = (product: PreparationProduct) => {
    setActiveProduct(product);
    setTargetQuantity(0);
    setQuantityInput('');
    setPackagingPhase('SELECT_QTY');
    setCurrentPackageNum(1);
    setCurrentBookIndex(0);
    setCompletedPackagesCount(0);
    setScannedHistory([]);
    setBarcodeInput('');
    setScanFeedback({ type: null, message: '' });
    setIsPackingModalOpen(true);
  };

  // Begin Scanning for selected target quantity
  const handleConfirmQuantityAndStartScanning = () => {
    const qty = parseInt(quantityInput, 10) || targetQuantity;
    if (!qty || qty <= 0) {
      alert('Kripya package ki sankhya type karein (e.g. 5, 10)');
      return;
    }
    setTargetQuantity(qty);
    setPackagingPhase('SCANNING');
    setCurrentPackageNum(1);
    setCurrentBookIndex(0);
    setCompletedPackagesCount(0);
    setScannedHistory([]);
    setBarcodeInput('');
    setScanFeedback({
      type: 'success',
      message: `Packaging started for ${qty} package(s). Scan Book 1 or click "Manual Tick" to begin!`,
    });

    if (soundEnabled) {
      playSuccessChime();
      speakVoiceAnnouncement(`Packaging started for ${qty} sets. Please scan or click books one by one.`);
    }

    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 150);
  };

  // Auto-focus barcode scanner input during scanning phase
  useEffect(() => {
    if (packagingPhase === 'SCANNING') {
      const timer = setInterval(() => {
        if (document.activeElement !== scanInputRef.current) {
          scanInputRef.current?.focus();
        }
      }, 1200);
      return () => clearInterval(timer);
    }
  }, [packagingPhase]);

  // Persist a single completed package immediately to backend
  const saveSinglePackage = async (productCode: string, booksScanned: string[]) => {
    setIsSavingBatch(true);
    try {
      const res = await api.post('/preparation/pack-batch', {
        productCode,
        productName: activeProduct?.productName,
        quantity: 1,
        scannedBooks: booksScanned,
      });

      if (res.data.success) {
        setCompletedPackagesCount((prev) => prev + 1);

        // Update local state immediately for instant UI responsiveness
        setStockSummary((prev) => ({
          ...prev,
          packagedStock: prev.packagedStock + 1,
          shelfStock: Math.max(0, prev.shelfStock - 1),
        }));

        setActiveProduct((prev) =>
          prev
            ? {
                ...prev,
                packagedStock: (prev.packagedStock || 0) + 1,
                shelfStock: Math.max(0, (prev.shelfStock || 0) - 1),
              }
            : null
        );

        fetchProducts();
      }
    } catch (err: any) {
      console.error('Failed to save completed package:', err);
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Direct batch pack without scanning
  const handleDirectPackWithoutScanning = async (overrideQty?: number) => {
    const qty = overrideQty !== undefined && overrideQty > 0 ? overrideQty : (parseInt(quantityInput, 10) || targetQuantity);
    if (!activeProduct || !qty || qty <= 0) {
      alert('Kripya package ki sankhya type karein (e.g. 5, 10)');
      return;
    }
    setIsSavingBatch(true);
    try {
      const res = await api.post('/preparation/pack-batch', {
        productCode: activeProduct.productCode,
        productName: activeProduct.productName,
        quantity: qty,
        scannedBooks: ['DIRECT_MANUAL_PACK'],
      });

      if (res.data.success) {
        setCompletedPackagesCount((prev) => prev + qty);
        setPackagingPhase('COMPLETED');
        setScanFeedback({
          type: 'success',
          message: `Successfully packed ${qty} package(s) directly without scanning!`,
        });

        if (soundEnabled) {
          playOrderCompleteFanfare();
          speakVoiceAnnouncement(`${qty} packages packed directly without scanning.`);
        }

        fetchProducts();
      }
    } catch (err: any) {
      console.error('Failed to direct pack batch:', err);
      setScanFeedback({
        type: 'error',
        message: 'Failed to direct pack. Please try again.',
      });
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Handle single physical book scan (or manual tick verification)
  const handleBookScan = (codeToScan: string) => {
    if (!activeProduct || packagingPhase !== 'SCANNING') return;

    const raw = codeToScan.trim().toUpperCase();
    setBarcodeInput('');
    if (!raw) return;

    const expectedBooks = activeProduct.books;
    if (expectedBooks.length === 0) {
      setScanFeedback({ type: 'error', message: 'No books configured in this product combo.' });
      return;
    }

    const expectedBook = expectedBooks[currentBookIndex];
    const cleanScanned = raw.replace(/[\s\-_]/g, '');
    const cleanExpected = expectedBook.bookCode.replace(/[\s\-_]/g, '').toUpperCase();

    // Check if scanned book matches expected book
    if (cleanScanned === cleanExpected) {
      // MATCH: Record book scan
      const nextScannedList = [
        ...scannedHistory,
        { packageNum: currentPackageNum, bookCode: expectedBook.bookCode, bookName: expectedBook.bookName },
      ];
      setScannedHistory(nextScannedList);

      if (soundEnabled) {
        playSuccessChime();
        speakVoiceAnnouncement(`Book ${currentBookIndex + 1} verified.`);
      }

      const nextBookIdx = currentBookIndex + 1;

      // Check if current package has all its books scanned
      if (nextBookIdx >= expectedBooks.length) {
        // Current package is complete! Persist to backend immediately
        saveSinglePackage(activeProduct.productCode, expectedBooks.map((b) => b.bookCode));

        const nextPackageNum = currentPackageNum + 1;

        if (nextPackageNum > targetQuantity) {
          // ALL PACKAGES IN BATCH ARE COMPLETE
          setPackagingPhase('COMPLETED');
          setScanFeedback({
            type: 'success',
            message: `Batch Completed! All ${targetQuantity} package(s) have been verified and packed!`,
          });

          if (soundEnabled) {
            playOrderCompleteFanfare();
            speakVoiceAnnouncement(`All ${targetQuantity} packages are packed successfully! Ready for parcel packaging.`);
          }
        } else {
          // Move to next package
          setCurrentPackageNum(nextPackageNum);
          setCurrentBookIndex(0);
          setScanFeedback({
            type: 'success',
            message: `Package ${currentPackageNum} complete & saved! Now scan Book 1 for Package ${nextPackageNum} of ${targetQuantity}...`,
          });
          if (soundEnabled) {
            speakVoiceAnnouncement(`Package ${currentPackageNum} complete and saved. Starting Package ${nextPackageNum}.`);
          }
        }
      } else {
        // Advance to next book in same package
        setCurrentBookIndex(nextBookIdx);
        const nextExpected = expectedBooks[nextBookIdx];
        setScanFeedback({
          type: 'success',
          message: `Book ${currentBookIndex + 1} verified! Next: scan "${nextExpected.bookName || nextExpected.bookCode}" (${nextBookIdx + 1}/${expectedBooks.length})`,
        });
      }
    } else {
      // MISMATCH
      if (soundEnabled) {
        playErrorTone();
        speakErrorMessage(`Galat book barcode! Kripya ${expectedBook.bookName || expectedBook.bookCode} scan karein.`);
      }
      setScanFeedback({
        type: 'error',
        message: `Galat Barcode "${raw}"! Expected: "${expectedBook.bookName || expectedBook.bookCode}" (${expectedBook.bookCode})`,
      });
    }

    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 50);
  };

  // Manual tick a single book without barcode scanning
  const handleManualTickBook = (targetBookIdx: number) => {
    if (!activeProduct || packagingPhase !== 'SCANNING') return;
    const expectedBooks = activeProduct.books;
    if (expectedBooks.length === 0) return;

    if (targetBookIdx !== currentBookIndex) return;

    const expectedBook = expectedBooks[currentBookIndex];
    handleBookScan(expectedBook.bookCode);
  };

  // Tick all remaining books in the current package directly
  const handleTickEntirePackage = () => {
    if (!activeProduct || packagingPhase !== 'SCANNING') return;
    const expectedBooks = activeProduct.books;
    if (expectedBooks.length === 0) return;

    const remainingBooks = expectedBooks.slice(currentBookIndex);
    const newScans = remainingBooks.map((b) => ({
      packageNum: currentPackageNum,
      bookCode: b.bookCode,
      bookName: b.bookName,
    }));

    setScannedHistory((prev) => [...prev, ...newScans]);

    if (soundEnabled) {
      playSuccessChime();
      speakVoiceAnnouncement(`Package ${currentPackageNum} complete.`);
    }

    // Save this 1 package immediately to backend
    saveSinglePackage(activeProduct.productCode, expectedBooks.map((b) => b.bookCode));

    const nextPackageNum = currentPackageNum + 1;
    if (nextPackageNum > targetQuantity) {
      setPackagingPhase('COMPLETED');
      setScanFeedback({
        type: 'success',
        message: `Batch Completed! All ${targetQuantity} package(s) have been verified and packed!`,
      });
      if (soundEnabled) {
        playOrderCompleteFanfare();
        speakVoiceAnnouncement(`All ${targetQuantity} packages are packed successfully!`);
      }
    } else {
      setCurrentPackageNum(nextPackageNum);
      setCurrentBookIndex(0);
      setScanFeedback({
        type: 'success',
        message: `Package ${currentPackageNum} complete & saved! Now scan Book 1 for Package ${nextPackageNum} of ${targetQuantity}...`,
      });
    }
  };

  // Direct pack remaining packages in batch without scanning
  const handleDirectPackRemaining = async () => {
    const remaining = targetQuantity - completedPackagesCount;
    if (remaining <= 0) return;
    await handleDirectPackWithoutScanning(remaining);
  };

  const totalBooksInBatch = activeProduct ? activeProduct.books.length * targetQuantity : 0;
  const currentScannedCount = scannedHistory.length;
  const overallProgressPct = totalBooksInBatch > 0 ? Math.round((currentScannedCount / totalBooksInBatch) * 100) : 0;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* ─── 1. Header Section ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100 shadow-2xs">
            <PackageCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Product Preparation Station (पैकेजिंग तैयारी)
              </h1>
              <span className="hidden sm:inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Packaging Queue
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Combo products ko pehle se pack karke rakhein. Books scan karein aur ready parcel stock build karein.
            </p>
          </div>
        </div>

        {/* Top Control Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs'
                : 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200'
            }`}
            title="Toggle Chime & Voice Feedback"
          >
            {soundEnabled ? <Volume2 size={14} className="text-emerald-600" /> : <VolumeX size={14} className="text-slate-400" />}
            <span>{soundEnabled ? 'Chime & Voice ON' : 'Sound Muted'}</span>
          </button>

          <button
            onClick={fetchProducts}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Refresh Stock Data"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ─── 2. Summary Statistics Cards (4 Uniform Cards) ─────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Parcel Packaging */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                Parcel Packaging
              </span>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded">
                Ready Sets
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-0.5 leading-tight">
              {stockSummary.packagedStock}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
              Ready combo sets ({stockSummary.packagedBooksCount} books)
            </div>
          </div>
        </div>

        {/* Card 2: Shelf Available */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <Boxes className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                Shelf Available
              </span>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                Loose
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-0.5 leading-tight">
              {stockSummary.shelfStock}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
              Open loose books resting on shelves
            </div>
          </div>
        </div>

        {/* Card 3: Available Stock */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                Available Stock
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                Total
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-0.5 leading-tight">
              {stockSummary.totalAvailableStock}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5 font-mono">
              {stockSummary.shelfStock} Shelf + {stockSummary.packagedBooksCount} in Packets
            </div>
          </div>
        </div>

        {/* Card 4: Combo Products */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200">
            <Barcode className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                Combo Products
              </span>
              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                Catalog
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-0.5 leading-tight">
              {products.length}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
              Registered combo product codes
            </div>
          </div>
        </div>
      </div>

      {/* ─── 3. Search and Filter Toolbar ────────────────────────────────────────── */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Product Code (e.g. CA-INTER-G1), Name, or Book Barcode..."
            className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50/70 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 focus:bg-white text-slate-800 placeholder:text-slate-400 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters & Sorting */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status Dropdown */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="appearance-none bg-white border border-slate-200 rounded-lg pl-2.5 pr-7 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 cursor-pointer"
            >
              <option value="ALL">All Stock Status</option>
              <option value="PACKAGED">Packaged Ready (&gt; 0)</option>
              <option value="UNPACKAGED">Needs Packaging (0 Packaged)</option>
              <option value="SHELF_AVAILABLE">Shelf Available (&gt; 0)</option>
              <option value="SHELF_EMPTY">Out of Shelf Stock</option>
            </select>
            <SlidersHorizontal size={12} className="text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none bg-white border border-slate-200 rounded-lg pl-2.5 pr-7 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 cursor-pointer"
            >
              <option value="CODE_ASC">Sort: Product Code (A-Z)</option>
              <option value="NAME_ASC">Sort: Product Name (A-Z)</option>
              <option value="PACKAGED_DESC">Most Packaged Ready</option>
              <option value="SHELF_DESC">Most Shelf Stock</option>
              <option value="TOTAL_DESC">Highest Total Available</option>
            </select>
            <span className="text-slate-400 text-[10px] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">▼</span>
          </div>

          {/* Product Count Pill */}
          <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-medium whitespace-nowrap text-[11px] border border-slate-200">
            Showing <strong className="text-slate-900 font-bold">{filteredProducts.length}</strong> of {products.length}
          </span>
        </div>
      </div>

      {/* ─── 4. Product Catalog Grid (3-Col Desktop, 2-Col Tablet, 1-Col Mobile) ─── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center shadow-2xs">
          <div className="w-9 h-9 border-3 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-600">Loading products & inventory stock...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3 border border-slate-200">
            <Package className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No Products Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            No combo products matched your search or filter criteria. Try clearing search keywords or resetting filters.
          </p>
          {(searchQuery || statusFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
              }}
              className="mt-3.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const hasPackaged = product.packagedStock > 0;
            const hasShelf = product.shelfStock > 0;

            return (
              <div
                key={product.id || `${product.productCode}-${product.productName}`}
                className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                <div className="p-4 sm:p-4.5">
                  {/* Top Row: Product Code & Packaged Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200/80">
                      {product.productCode}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                        hasPackaged
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}
                    >
                      <Package size={12} className={hasPackaged ? 'text-emerald-600' : 'text-slate-400'} />
                      <span>{hasPackaged ? `${product.packagedStock} Packaged Ready` : '0 Packaged'}</span>
                    </span>
                  </div>

                  {/* Product Title */}
                  <h3
                    className="font-bold text-slate-900 text-sm mb-3 leading-snug line-clamp-2 min-h-[2.5rem]"
                    title={product.productName}
                  >
                    {product.productName}
                  </h3>

                  {/* 3-Column Stock Information Section */}
                  <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200/80 mb-3 text-center">
                    <div className="bg-white rounded py-1 px-1 border border-slate-200/60">
                      <span className="text-[9px] uppercase font-semibold text-slate-400 block tracking-wider">
                        Shelf (खुली)
                      </span>
                      <div className={`font-mono text-xs sm:text-sm font-bold mt-0.5 ${hasShelf ? 'text-amber-700' : 'text-slate-400'}`}>
                        {product.shelfStock}
                      </div>
                    </div>

                    <div className="bg-white rounded py-1 px-1 border border-slate-200/60">
                      <span className="text-[9px] uppercase font-semibold text-slate-400 block tracking-wider">
                        Pre-Pack (पैक्ड)
                      </span>
                      <div className={`font-mono text-xs sm:text-sm font-bold mt-0.5 ${hasPackaged ? 'text-indigo-700' : 'text-slate-400'}`}>
                        {product.packagedStock}
                      </div>
                    </div>

                    <div className="bg-white rounded py-1 px-1 border border-slate-200/60">
                      <span className="text-[9px] uppercase font-semibold text-slate-400 block tracking-wider">
                        Total Available
                      </span>
                      <div className="font-mono text-xs sm:text-sm font-bold text-emerald-700 mt-0.5">
                        {product.totalAvailableStock}
                      </div>
                    </div>
                  </div>

                  {/* Books in this Product */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      <span className="flex items-center gap-1">
                        <BookOpen size={12} className="text-slate-400" />
                        <span>Books ({product.books.length}):</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Barcode</span>
                    </div>

                    <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                      {product.books.map((b, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs bg-slate-50/80 hover:bg-slate-100/70 px-2 py-1 rounded border border-slate-150 transition-colors"
                        >
                          <span className="text-slate-700 font-medium truncate pr-2 text-[11px]" title={b.bookName}>
                            {idx + 1}. {b.bookName || b.bookCode}
                          </span>
                          <span className="font-mono text-[10px] font-semibold text-slate-500 shrink-0 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                            {b.bookCode}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons: Edit / Delete Package Stock + Start Packaging */}
                <div className="p-4 pt-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditStock(product)}
                      className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200"
                      title="Packaged stock count kam ya zyada karein"
                    >
                      <Pencil size={12} className="text-slate-500" />
                      <span>Edit Package</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeletePackagedStock(product)}
                      disabled={product.packagedStock <= 0}
                      className="py-1.5 px-2.5 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border border-slate-200 hover:border-rose-200"
                      title={product.packagedStock > 0 ? "Packaged stock 0 / delete karein" : "Abhi koi package ready nahi hai"}
                    >
                      <Trash2 size={12} />
                      <span>Delete (0)</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleStartPackaging(product)}
                    className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-xs font-semibold rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play size={13} className="fill-white" />
                    <span>Start Packaging (पैक करें)</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 5. Interactive Hands-Free Packaging Modal ────────────────────────────── */}
      {isPackingModalOpen && activeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl border border-slate-200 relative overflow-hidden animate-in zoom-in-95 duration-200 text-slate-800">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-3.5">
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                    {activeProduct.productCode}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Currently Packaged: {activeProduct.packagedStock} sets
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 truncate" title={activeProduct.productName}>
                  {activeProduct.productName}
                </h2>
              </div>
              <button
                onClick={() => setIsPackingModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* ── PHASE 1: SELECT TARGET QUANTITY ── */}
            {packagingPhase === 'SELECT_QTY' && (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Enter Package Quantity (पैकेट की संख्या डालें)
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">
                    Type the number of ready packages you want to prepare.
                  </p>

                  {/* Clean Simple Type Box */}
                  <div className="max-w-xs mx-auto">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={quantityInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, ''); // Digits only
                        setQuantityInput(val);
                        const num = parseInt(val, 10);
                        setTargetQuantity(!isNaN(num) && num > 0 ? num : 0);
                      }}
                      placeholder="Type count here (e.g. 5, 10)..."
                      className="w-full h-11 px-4 text-center font-mono font-bold text-lg bg-white border-2 border-indigo-500 rounded-lg focus:outline-none focus:ring-4 focus:ring-indigo-100 text-slate-900 placeholder:text-slate-400 placeholder:font-normal placeholder:text-xs shadow-2xs transition-all"
                      autoFocus
                    />
                  </div>

                  {/* Quick Preset Chips */}
                  <div className="flex items-center justify-center gap-1.5 mt-3.5 flex-wrap">
                    <span className="text-[11px] text-slate-400 font-medium mr-1">Quick Select:</span>
                    {[1, 3, 5, 10, 20, 50, 100].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => {
                          setTargetQuantity(qty);
                          setQuantityInput(String(qty));
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          quantityInput === String(qty)
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {qty}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calculation Preview */}
                <div className="bg-indigo-50/60 p-3 rounded-lg border border-indigo-100 text-xs flex justify-between items-center text-indigo-900">
                  <span className="font-medium">
                    Each package: <strong className="font-bold">{activeProduct.books.length} books</strong>
                  </span>
                  <span className="font-medium">
                    Total books to pack:{' '}
                    <strong className="font-mono font-bold text-sm">
                      {targetQuantity > 0 ? activeProduct.books.length * targetQuantity : '—'}
                    </strong>
                  </span>
                </div>

                {/* Dual Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    onClick={handleConfirmQuantityAndStartScanning}
                    className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ScanLine size={14} />
                    <span>Scan Books {targetQuantity > 0 ? `(${targetQuantity} Pkg)` : ''}</span>
                  </button>

                  <button
                    onClick={() => handleDirectPackWithoutScanning()}
                    disabled={isSavingBatch}
                    className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Zap size={14} className={isSavingBatch ? 'animate-spin' : ''} />
                    <span>Direct Pack Without Scanning</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── PHASE 2: HANDS-FREE BOOK SCANNING / MANUAL TICK ── */}
            {packagingPhase === 'SCANNING' && (
              <div className="space-y-3.5">
                {/* Early Save Status Banner */}
                {completedPackagesCount > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between text-xs text-emerald-900 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span className="font-medium">
                        ✓ {completedPackagesCount} Package(s) saved to Packaged Stock
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setIsPackingModalOpen(false);
                        fetchProducts();
                      }}
                      className="px-2.5 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-semibold cursor-pointer transition-colors"
                    >
                      Save & Exit ({completedPackagesCount})
                    </button>
                  </div>
                )}

                {/* Active Package Tracker Header */}
                <div className="flex items-center justify-between bg-slate-800 text-white px-3 py-2 rounded-lg text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-semibold text-slate-400">Current:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      Package {currentPackageNum} of {targetQuantity}
                    </span>
                  </div>
                  <div className="text-slate-300 font-mono text-[11px]">
                    {currentScannedCount} / {totalBooksInBatch} Books ({overallProgressPct}%)
                  </div>
                </div>

                {/* Overall Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${overallProgressPct}%` }}
                  />
                </div>

                {/* List of Books for CURRENT Package */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">
                      Package #{currentPackageNum} Required Books:
                    </span>
                    <button
                      type="button"
                      onClick={handleTickEntirePackage}
                      disabled={isSavingBatch}
                      className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-800 bg-white border border-indigo-200 hover:bg-indigo-50 px-2 py-0.5 rounded transition-colors cursor-pointer"
                      title="Tick all books for this package"
                    >
                      <Zap size={11} />
                      <span>Tick Whole Package #{currentPackageNum}</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {activeProduct.books.map((b, idx) => {
                      const isScanned = idx < currentBookIndex;
                      const isCurrent = idx === currentBookIndex;

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded-lg border transition-all text-xs ${
                            isScanned
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-medium'
                              : isCurrent
                              ? 'bg-white border-indigo-400 shadow-2xs ring-1 ring-indigo-200'
                              : 'bg-white border-slate-200/80 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            {isScanned ? (
                              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            ) : (
                              <span
                                className={`w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                  isCurrent ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {idx + 1}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className={`truncate ${isCurrent ? 'font-bold text-slate-900' : 'font-medium'}`}>
                                {b.bookName || b.bookCode}
                              </div>
                              <div className="font-mono text-[10px] text-slate-400">
                                {b.bookCode}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isScanned ? (
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                Done
                              </span>
                            ) : isCurrent ? (
                              <button
                                type="button"
                                onClick={() => handleManualTickBook(idx)}
                                disabled={isSavingBatch}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Check size={12} />
                                <span>Tick</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400">Waiting</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Barcode Scanner Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (barcodeInput.trim()) handleBookScan(barcodeInput);
                  }}
                  className="space-y-1.5"
                >
                  <div className="relative">
                    <input
                      ref={scanInputRef}
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value.toUpperCase())}
                      placeholder={`Scan Book ${currentBookIndex + 1} (${activeProduct.books[currentBookIndex]?.bookCode || ''}) or click Tick...`}
                      className="w-full pl-3 pr-20 py-2.5 text-xs sm:text-sm font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 bg-white"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!barcodeInput.trim()}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                    >
                      Verify
                    </button>
                  </div>
                </form>

                {/* Feedback message */}
                {scanFeedback.message && (
                  <div
                    className={`p-2 rounded-lg text-xs font-medium border flex items-center gap-2 ${
                      scanFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    {scanFeedback.type === 'success' ? (
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                    )}
                    <span className="truncate">{scanFeedback.message}</span>
                  </div>
                )}

                {/* Footer Controls during scanning */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                  {targetQuantity > currentPackageNum ? (
                    <button
                      type="button"
                      onClick={handleDirectPackRemaining}
                      disabled={isSavingBatch}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg font-medium transition-colors cursor-pointer text-xs"
                    >
                      <Zap size={12} className="text-amber-600" />
                      <span>Direct Pack Remaining ({targetQuantity - completedPackagesCount} Pkg)</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  {completedPackagesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsPackingModalOpen(false);
                        fetchProducts();
                      }}
                      className="w-full sm:w-auto px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors cursor-pointer text-xs"
                    >
                      Exit ({completedPackagesCount} Saved)
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── PHASE 3: BATCH COMPLETED ── */}
            {packagingPhase === 'COMPLETED' && (
              <div className="text-center py-5 space-y-3 animate-in zoom-in-95">
                <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-2xs">
                  <CheckCircle2 size={30} />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Packaging Batch Complete!
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {completedPackagesCount || targetQuantity} package(s) of "{activeProduct.productCode}" are now in ready parcel stock.
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs max-w-sm mx-auto text-left space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Product:</span>
                    <span className="font-semibold text-slate-800 truncate pl-2">{activeProduct.productName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Packages Prepared:</span>
                    <span className="font-mono font-bold text-indigo-700">+{completedPackagesCount || targetQuantity} Sets</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Books Added:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {activeProduct.books.length * (completedPackagesCount || targetQuantity)} books
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                    <span className="text-slate-700">New Packaged Stock:</span>
                    <span className="font-mono text-emerald-700">
                      {activeProduct.packagedStock} sets
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => {
                      setPackagingPhase('SELECT_QTY');
                      setTargetQuantity(0);
                      setQuantityInput('');
                      setCompletedPackagesCount(0);
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                  >
                    Pack Another Batch
                  </button>
                  <button
                    onClick={() => {
                      setIsPackingModalOpen(false);
                      fetchProducts();
                    }}
                    className="px-5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-all cursor-pointer"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 6. Edit Packaged Stock Modal ─────────────────────────────────────── */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 relative overflow-hidden animate-in zoom-in-95 duration-200 text-slate-800">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-3.5">
              <div className="min-w-0 pr-2">
                <span className="font-mono text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 inline-block mb-1">
                  {editingProduct.productCode}
                </span>
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  Edit Packaged Stock
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs" title={editingProduct.productName}>
                  {editingProduct.productName}
                </p>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center">
                <div className="text-[11px] font-semibold uppercase text-slate-600 mb-1">
                  Packaged Sets Count (पैकेज संख्या कम या ज्यादा करें)
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Type new count or use − / + buttons
                </p>

                {/* Stepper + Input */}
                <div className="flex items-center justify-center gap-2 max-w-xs mx-auto">
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(editStockValue, 10) || 0;
                      setEditStockValue(String(Math.max(0, current - 1)));
                    }}
                    className="w-9 h-9 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold text-base cursor-pointer shadow-2xs select-none"
                    title="Decrease by 1"
                  >
                    −
                  </button>

                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={editStockValue}
                    onChange={(e) => setEditStockValue(e.target.value)}
                    className="w-24 h-9 px-2 text-center font-mono font-bold text-base bg-white border-2 border-indigo-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 text-slate-900 shadow-2xs"
                    autoFocus
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(editStockValue, 10) || 0;
                      setEditStockValue(String(current + 1));
                    }}
                    className="w-9 h-9 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold text-base cursor-pointer shadow-2xs select-none"
                    title="Increase by 1"
                  >
                    +
                  </button>
                </div>

                <div className="text-[11px] text-slate-500 mt-2 font-medium">
                  Current Packaged: <strong className="font-mono text-slate-800">{editingProduct.packagedStock} sets</strong>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed bg-amber-50/60 p-2.5 rounded-lg border border-amber-200/80 text-amber-900">
                💡 <strong>Note:</strong> Package count kam ya zyada karne par bachi hui kitabein automatically shelf stock me adjust ho jayengi.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveStockEdit}
                  disabled={isSavingStockEdit}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
                >
                  {isSavingStockEdit ? <RefreshCw size={12} className="animate-spin" /> : <Check size={13} />}
                  <span>Save Stock (सेव करें)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreparationPage;
