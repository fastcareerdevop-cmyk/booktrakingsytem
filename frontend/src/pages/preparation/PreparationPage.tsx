import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Package,
  Boxes,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Search,
  ScanLine,
  RefreshCw,
  Plus,
  Play,
  RotateCcw,
  Sparkles,
  Barcode,
  Truck,
  Volume2,
  VolumeX,
  X,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import api from '../../services/api';
import { playSuccessChime, playErrorTone, playOrderCompleteFanfare, speakVoiceAnnouncement, speakErrorMessage } from '../../utils/sound';

interface BookItem {
  bookCode: string;
  bookName: string;
  availableQuantity: number;
}

interface PreparationProduct {
  productCode: string;
  productName: string;
  books: BookItem[];
  totalBooksCount: number;
  packagedStock: number;
  shelfStock: number;
  totalAvailableStock: number;
  totalBatchesPacked: number;
  lastPackedAt?: string;
}

export const PreparationPage: React.FC = () => {
  const [products, setProducts] = useState<PreparationProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Live Warehouse Stock Summary (Shelf vs Packaged)
  const [stockSummary, setStockSummary] = useState({
    totalAvailableStock: 0,
    shelfStock: 0,
    packagedStock: 0,
  });

  // Active Packaging Modal State
  const [activeProduct, setActiveProduct] = useState<PreparationProduct | null>(null);
  const [isPackingModalOpen, setIsPackingModalOpen] = useState(false);
  const [targetQuantity, setTargetQuantity] = useState<number>(1);
  const [packagingPhase, setPackagingPhase] = useState<'SELECT_QTY' | 'SCANNING' | 'COMPLETED'>('SELECT_QTY');

  // Scanning Progress State
  const [currentPackageNum, setCurrentPackageNum] = useState<number>(1);
  const [currentBookIndex, setCurrentBookIndex] = useState<number>(0);
  const [scannedHistory, setScannedHistory] = useState<{ packageNum: number; bookCode: string; bookName: string }[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [isSavingBatch, setIsSavingBatch] = useState(false);

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
        setStockSummary({
          totalAvailableStock: summaryRes.data.data.totalAvailableStock || 0,
          shelfStock: summaryRes.data.data.shelfStock || 0,
          packagedStock: summaryRes.data.data.packagedStock || 0,
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

  // Filtered products list
  const filteredProducts = products.filter(p =>
    p.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.books.some(b => b.bookCode.toLowerCase().includes(searchQuery.toLowerCase()) || b.bookName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Open Packing Station for a product
  const handleStartPackaging = (product: PreparationProduct) => {
    setActiveProduct(product);
    setTargetQuantity(1);
    setPackagingPhase('SELECT_QTY');
    setCurrentPackageNum(1);
    setCurrentBookIndex(0);
    setScannedHistory([]);
    setBarcodeInput('');
    setScanFeedback({ type: null, message: '' });
    setIsPackingModalOpen(true);
  };

  // Begin Scanning for selected target quantity
  const handleConfirmQuantityAndStartScanning = () => {
    if (targetQuantity <= 0) return;
    setPackagingPhase('SCANNING');
    setCurrentPackageNum(1);
    setCurrentBookIndex(0);
    setScannedHistory([]);
    setBarcodeInput('');
    setScanFeedback({
      type: 'success',
      message: `Packaging started for ${targetQuantity} package(s). Scan Book 1 to begin!`,
    });

    if (soundEnabled) {
      playSuccessChime();
      speakVoiceAnnouncement(`Packaging started for ${targetQuantity} sets. Please scan books one by one.`);
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

  // Handle single physical book scan
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
      // ✅ MATCH: Record book scan
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
        // Current package is complete!
        const nextPackageNum = currentPackageNum + 1;

        if (nextPackageNum > targetQuantity) {
          // 🎉 ALL PACKAGES IN BATCH ARE COMPLETE!
          // "fir product count pura ho jayega fir uske bad book scan hona band ho jayega!"
          setPackagingPhase('COMPLETED');
          setScanFeedback({
            type: 'success',
            message: `🎉 Batch Completed! All ${targetQuantity} package(s) have been verified and packed!`,
          });

          if (soundEnabled) {
            playOrderCompleteFanfare();
            speakVoiceAnnouncement(`All ${targetQuantity} packages are packed successfully! Ready for parcel packaging.`);
          }

          // Persist batch to backend
          handleSaveCompletedBatch(activeProduct.productCode, targetQuantity, nextScannedList.map(s => s.bookCode));
        } else {
          // Move to next package
          setCurrentPackageNum(nextPackageNum);
          setCurrentBookIndex(0);
          setScanFeedback({
            type: 'success',
            message: `✓ Package ${currentPackageNum} complete! Now scan Book 1 for Package ${nextPackageNum} of ${targetQuantity}...`,
          });
          if (soundEnabled) {
            speakVoiceAnnouncement(`Package ${currentPackageNum} complete. Starting Package ${nextPackageNum}.`);
          }
        }
      } else {
        // Advance to next book in same package
        setCurrentBookIndex(nextBookIdx);
        const nextExpected = expectedBooks[nextBookIdx];
        setScanFeedback({
          type: 'success',
          message: `✓ Book ${currentBookIndex + 1} verified! Next: scan "${nextExpected.bookName || nextExpected.bookCode}" (${nextBookIdx + 1}/${expectedBooks.length})`,
        });
      }
    } else {
      // ❌ MISMATCH
      if (soundEnabled) {
        playErrorTone();
        speakErrorMessage(`Galat book barcode! Kripya ${expectedBook.bookName || expectedBook.bookCode} scan karein.`);
      }
      setScanFeedback({
        type: 'error',
        message: `⚠️ Galat Barcode "${raw}"! Expected: "${expectedBook.bookName || expectedBook.bookCode}" (${expectedBook.bookCode})`,
      });
    }

    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 50);
  };

  // Save completed batch to backend
  const handleSaveCompletedBatch = async (productCode: string, qty: number, booksScanned: string[]) => {
    setIsSavingBatch(true);
    try {
      const res = await api.post('/preparation/pack-batch', {
        productCode,
        quantity: qty,
        scannedBooks: booksScanned,
      });

      if (res.data.success) {
        fetchProducts();
      }
    } catch (err: any) {
      console.error('Failed to save preparation batch:', err);
    } finally {
      setIsSavingBatch(false);
    }
  };

  const totalBooksInBatch = activeProduct ? activeProduct.books.length * targetQuantity : 0;
  const currentScannedCount = scannedHistory.length;
  const overallProgressPct = totalBooksInBatch > 0 ? Math.round((currentScannedCount / totalBooksInBatch) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* ─── Page Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Layers className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Product Preparation Station (पैकेजिंग तैयारी)
            </h1>
          </div>
          <p className="text-sm font-medium text-slate-500">
            Combo products ko pehle se pack karke rakhein. Books ek-ek karke scan karein aur pre-packaged parcel stock ready karein.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer"
          >
            {soundEnabled ? <Volume2 size={16} className="text-emerald-600" /> : <VolumeX size={16} className="text-slate-400" />}
            <span>{soundEnabled ? 'Chime & Voice ON' : 'Muted'}</span>
          </button>
          <button
            onClick={fetchProducts}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ─── Top Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Pre-Packaged Ready Stock */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/60 rounded-2xl p-4 border border-indigo-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
              <Package size={16} className="text-indigo-600" />
              Parcel Packaging (पैक्ड पार्सल)
            </span>
            <span className="bg-indigo-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">
              Ready Sets
            </span>
          </div>
          <div className="text-3xl font-black text-indigo-950 font-mono">
            {stockSummary.packagedStock}
          </div>
          <p className="text-xs text-indigo-700 font-medium mt-1">
            Pre-packed combo packages ready for dispatch
          </p>
        </div>

        {/* Card 2: Shelf Stock (Loose Books) */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/60 rounded-2xl p-4 border border-amber-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <Boxes size={16} className="text-amber-600" />
              Shelf Available (शेल्फ स्टॉक)
            </span>
            <span className="bg-amber-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">
              Loose Copies
            </span>
          </div>
          <div className="text-3xl font-black text-amber-950 font-mono">
            {stockSummary.shelfStock}
          </div>
          <p className="text-xs text-amber-700 font-medium mt-1">
            Open books currently resting on shelves
          </p>
        </div>

        {/* Card 3: Total Warehouse Stock */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl p-4 border border-emerald-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-emerald-600" />
              Available Stock (कुल उपलब्ध)
            </span>
            <span className="bg-emerald-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">
              Total Books
            </span>
          </div>
          <div className="text-3xl font-black text-emerald-950 font-mono">
            {stockSummary.totalAvailableStock}
          </div>
          <p className="text-xs text-emerald-700 font-medium mt-1 font-mono">
            Shelf ({stockSummary.shelfStock}) + Packaged ({stockSummary.packagedStock}) = Total {stockSummary.totalAvailableStock}
          </p>
        </div>

        {/* Card 4: Total Combo Products */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100/70 rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Barcode size={16} className="text-slate-600" />
              Combo Products
            </span>
            <span className="bg-slate-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">
              Catalog
            </span>
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">
            {products.length}
          </div>
          <p className="text-xs text-slate-600 font-medium mt-1">
            Registered combo product codes
          </p>
        </div>
      </div>

      {/* ─── Search and Filters Bar ────────────────────────────────────────────── */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Product Code (e.g. CA-INTER-G1), Product Name, or Book Barcode..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>
        <div className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          Showing <span className="font-bold text-slate-800">{filteredProducts.length}</span> of {products.length} Products
        </div>
      </div>

      {/* ─── Product Catalog Grid ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Loading products & stock data...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Products Found</h3>
          <p className="text-xs text-slate-500 mt-1">Try adjusting your search query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((product) => (
            <div
              key={product.productCode}
              className="bg-white rounded-2xl border-2 border-slate-200 hover:border-indigo-400 p-5 shadow-xs transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header: Product Code & Packaged Badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-mono text-xs font-black px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200">
                    {product.productCode}
                  </span>
                  <div className="text-right">
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                      product.packagedStock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      📦 {product.packagedStock} Packaged Ready
                    </span>
                  </div>
                </div>

                {/* Product Title */}
                <h3 className="font-bold text-slate-900 text-base mb-3 leading-snug">
                  {product.productName}
                </h3>

                {/* Stock Breakdown Card */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 mb-4 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Shelf Available (खुली):</span>
                    <span className="font-mono font-bold text-amber-700">{product.shelfStock} on shelf</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Pre-Packaged (पैक्ड):</span>
                    <span className="font-mono font-bold text-indigo-700">{product.packagedStock} sets</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 text-slate-800 font-bold">
                    <span>Total Available:</span>
                    <span className="font-mono text-emerald-700">{product.totalAvailableStock} copies</span>
                  </div>
                </div>

                {/* Included Books List */}
                <div className="mb-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Books in this Product ({product.books.length}):
                  </div>
                  <div className="space-y-1">
                    {product.books.map((b, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-[11px] bg-slate-50/80 px-2.5 py-1 rounded border border-slate-100"
                      >
                        <span className="font-medium text-slate-700 truncate pr-2" title={b.bookName}>
                          {idx + 1}. {b.bookName || b.bookCode}
                        </span>
                        <span className="font-mono font-bold text-slate-500 text-[10px] shrink-0">
                          {b.bookCode}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => handleStartPackaging(product)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play size={14} />
                <span>Start Packaging (पैक करें)</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─── Interactive Hands-Free Packaging Modal ────────────────────────────── */}
      {isPackingModalOpen && activeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-xs font-black bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-md">
                    {activeProduct.productCode}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Currently Packaged: {activeProduct.packagedStock} sets
                  </span>
                </div>
                <h2 className="text-lg font-black text-slate-900">
                  {activeProduct.productName}
                </h2>
              </div>
              <button
                onClick={() => setIsPackingModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* ── PHASE 1: SELECT TARGET QUANTITY ── */}
            {packagingPhase === 'SELECT_QTY' && (
              <div className="space-y-5">
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 text-center">
                  <h4 className="text-sm font-bold text-indigo-950 mb-1">
                    Kitne product pack karne hain? (Select Target Quantity)
                  </h4>
                  <p className="text-xs text-indigo-700">
                    Kitne packages ready karke parcel packaging me rakhne hain?
                  </p>

                  {/* Quick Select Buttons */}
                  <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                    {[1, 3, 5, 10, 20, 50].map((qty) => (
                      <button
                        key={qty}
                        onClick={() => setTargetQuantity(qty)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                          targetQuantity === qty
                            ? 'bg-indigo-600 text-white shadow-md scale-105'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {qty} {qty === 1 ? 'Package' : 'Packages'}
                      </button>
                    ))}
                  </div>

                  {/* Custom Input */}
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <span className="text-xs text-slate-500 font-semibold">Ya custom quantity daalein:</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={targetQuantity}
                      onChange={(e) => setTargetQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-20 px-3 py-1.5 text-center font-mono font-bold text-sm bg-white border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Calculation Preview */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                  <span className="text-slate-600 font-medium">
                    Each package requires <strong className="text-slate-800">{activeProduct.books.length} books</strong>.
                  </span>
                  <span className="font-bold text-indigo-800">
                    Total books to scan: <strong className="font-mono text-sm">{activeProduct.books.length * targetQuantity} books</strong>
                  </span>
                </div>

                <button
                  onClick={handleConfirmQuantityAndStartScanning}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ScanLine size={18} />
                  <span>Next: Start Scanning Books ({targetQuantity} Packages)</span>
                </button>
              </div>
            )}

            {/* ── PHASE 2: HANDS-FREE BOOK SCANNING ── */}
            {packagingPhase === 'SCANNING' && (
              <div className="space-y-4">
                {/* Active Package Tracker Header */}
                <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-2.5 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Package:</span>
                    <span className="font-mono text-sm font-black text-emerald-400">
                      Package {currentPackageNum} of {targetQuantity}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-medium font-mono">
                    Total: {currentScannedCount} / {totalBooksInBatch} Books ({overallProgressPct}%)
                  </div>
                </div>

                {/* Overall Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${overallProgressPct}%` }}
                  />
                </div>

                {/* List of Books for CURRENT Package */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                  <div className="text-xs font-bold uppercase text-slate-500 mb-2">
                    Books Required for Package #{currentPackageNum}:
                  </div>
                  <div className="space-y-2">
                    {activeProduct.books.map((b, idx) => {
                      const isScanned = idx < currentBookIndex;
                      const isCurrent = idx === currentBookIndex;

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                            isScanned
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                              : isCurrent
                              ? 'bg-white border-2 border-indigo-500 shadow-md ring-2 ring-indigo-100'
                              : 'bg-white border-slate-200 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {isScanned ? (
                              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                            ) : (
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                                isCurrent ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {idx + 1}
                              </span>
                            )}
                            <div>
                              <div className={`text-xs ${isCurrent ? 'font-black text-slate-900' : 'font-medium'}`}>
                                {b.bookName || b.bookCode}
                              </div>
                              <div className="font-mono text-[10px] text-slate-500">
                                Barcode: {b.bookCode}
                              </div>
                            </div>
                          </div>

                          <div>
                            {isScanned ? (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                                ✓ Scanned
                              </span>
                            ) : isCurrent ? (
                              <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 animate-bounce">
                                ⚡ Aim Scanner Here
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">
                                Waiting...
                              </span>
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
                  className="space-y-2"
                >
                  <div className="relative">
                    <input
                      ref={scanInputRef}
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value.toUpperCase())}
                      placeholder={`⚡ Scan Book ${currentBookIndex + 1} (${activeProduct.books[currentBookIndex]?.bookCode || ''})...`}
                      className="w-full px-4 py-3.5 text-sm font-mono font-bold border-2 border-indigo-500 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 bg-white shadow-xs"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!barcodeInput.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Verify
                    </button>
                  </div>
                </form>

                {/* Feedback message */}
                {scanFeedback.message && (
                  <div className={`p-3 rounded-xl text-xs font-medium border flex items-center gap-2 ${
                    scanFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}>
                    {scanFeedback.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <AlertTriangle size={16} className="text-rose-600 shrink-0" />}
                    <span>{scanFeedback.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── PHASE 3: BATCH COMPLETED ── */}
            {packagingPhase === 'COMPLETED' && (
              <div className="text-center py-6 space-y-4 animate-in zoom-in-95">
                <div className="relative flex items-center justify-center w-20 h-20 mx-auto">
                  <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
                  <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg">
                    <CheckCircle2 size={36} />
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Packaging Batch Complete!
                  </h3>
                  <p className="text-xs font-semibold text-emerald-700 mt-1">
                    ✓ {targetQuantity} package(s) of "{activeProduct.productCode}" are packed and ready in parcel packaging.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs max-w-sm mx-auto text-left space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Product:</span>
                    <span className="font-bold text-slate-800">{activeProduct.productName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Packages Prepared:</span>
                    <span className="font-mono font-black text-indigo-700">+{targetQuantity} Sets</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Books Scanned:</span>
                    <span className="font-mono font-bold text-slate-800">{totalBooksInBatch} books</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-700 font-bold">New Packaged Stock:</span>
                    <span className="font-mono font-black text-emerald-700">
                      {activeProduct.packagedStock + targetQuantity} ready sets
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      setPackagingPhase('SELECT_QTY');
                      setTargetQuantity(1);
                    }}
                    className="px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                  >
                    Pack Another Batch
                  </button>
                  <button
                    onClick={() => setIsPackingModalOpen(false)}
                    className="px-6 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all cursor-pointer"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PreparationPage;
