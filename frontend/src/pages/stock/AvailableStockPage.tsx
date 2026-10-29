import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import {
  Boxes,
  Search,
  Download,
  RefreshCw,
  PlusCircle,
  MinusCircle,
  Sliders,
  Edit3,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  ArrowUpDown,
  BookOpen,
  Truck,
  PackagePlus,
  Clock,
  Calendar,
  Trash2,
  History,
} from 'lucide-react';
import { BookStockHistoryModal } from '../../components/stock/BookStockHistoryModal';

export const AvailableStockPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [books, setBooks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [sortBy, setSortBy] = useState<string>('availableQuantity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [limit, setLimit] = useState<number>(50);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [summary, setSummary] = useState<any>({
    totalTitles: 0,
    totalAvailableCopies: 0,
    totalInwardCopies: 0,
    totalDispatchedCopies: 0,
    outOfStockTitles: 0,
    lowStockTitles: 0,
    inStockTitles: 0,
  });

  // Quick Restock Modal
  const [quickRestockBook, setQuickRestockBook] = useState<any>(null);
  const [quickQty, setQuickQty] = useState<string>('50');
  const [quickSupplier, setQuickSupplier] = useState<string>('');
  const [isQuickSubmitting, setIsQuickSubmitting] = useState<boolean>(false);

  // Stock Adjustment Modal (Set / Add / Reduce)
  const [adjustModalBook, setAdjustModalBook] = useState<any>(null);
  const [adjustMode, setAdjustMode] = useState<'SET' | 'ADD' | 'REDUCE'>('SET');
  const [adjustQty, setAdjustQty] = useState<string>('0');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState<boolean>(false);

  // Delete Book Modal (0 Stock Only)
  const [deleteModalBook, setDeleteModalBook] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Edit Book Details Modal
  const [editModalBook, setEditModalBook] = useState<any>(null);
  const [editBookCode, setEditBookCode] = useState<string>('');
  const [editBookName, setEditBookName] = useState<string>('');
  const [editProductCode, setEditProductCode] = useState<string>('');
  const [editAvailableQty, setEditAvailableQty] = useState<string>('0');
  const [editThreshold, setEditThreshold] = useState<string>('10');
  const [isUpdatingBook, setIsUpdatingBook] = useState<boolean>(false);

  // Book Stock History Modal
  const [historyModalBook, setHistoryModalBook] = useState<any>(null);

  const fetchStock = async (targetPage = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', targetPage.toString());
      params.append('limit', limit.toString());
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      const res = await api.get(`/stock/available?${params.toString()}`);
      if (res.data.success) {
        setBooks(res.data.data.books || []);
        setSummary(res.data.data.summary || {});
        setTotalPages(res.data.data.pagination.totalPages || 1);
        setPage(targetPage);
      }
    } catch (err: any) {
      console.error('Failed to fetch available stock:', err);
      error('Stock data load karne me samasya aayi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStock(1);
  }, [statusFilter, sortBy, sortOrder, limit]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStock(1);
  };

  // Quick Restock
  const handleQuickRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRestockBook) return;
    const qty = parseInt(quickQty, 10);
    if (isNaN(qty) || qty <= 0) {
      error('Quantity kam se kam 1 honi chahiye');
      return;
    }

    setIsQuickSubmitting(true);
    try {
      const res = await api.post('/stock/inward', {
        bookCode: quickRestockBook.bookCode,
        bookName: quickRestockBook.bookName,
        quantity: qty,
        supplier: quickSupplier,
        remarks: 'Quick Inward from Available Stock page',
        source: 'MANUAL',
      });

      if (res.data.success) {
        success(res.data.message || 'Stock successfully added!');
        setQuickRestockBook(null);
        setQuickQty('50');
        setQuickSupplier('');
        fetchStock(page);
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Stock update failed');
    } finally {
      setIsQuickSubmitting(false);
    }
  };

  // Open Stock Adjustment Modal
  const openAdjustModal = (book: any, defaultMode: 'SET' | 'ADD' | 'REDUCE' = 'SET') => {
    setAdjustModalBook(book);
    setAdjustMode(defaultMode);
    setAdjustQty(defaultMode === 'SET' ? String(book.availableQuantity || 0) : '10');
    setAdjustReason('');
  };

  // Submit Stock Adjustment (SET / ADD / REDUCE)
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalBook) return;

    const qty = parseInt(adjustQty, 10);
    if (isNaN(qty) || qty < 0) {
      error('Kripya valid quantity darj karein');
      return;
    }

    if (adjustMode === 'REDUCE') {
      if (qty <= 0) {
        error('Kam karne ke liye quantity 1 ya usse jyada honi chahiye');
        return;
      }
      if (qty > adjustModalBook.availableQuantity) {
        error(`Stock me keval ${adjustModalBook.availableQuantity} copies uplabdh hain. Isse jyada kam nahi kar sakte.`);
        return;
      }
    }

    if (adjustMode === 'ADD' && qty <= 0) {
      error('Jodne ke liye quantity 1 ya usse jyada honi chahiye');
      return;
    }

    setIsAdjusting(true);
    try {
      const res = await api.post('/stock/adjust', {
        bookCode: adjustModalBook.bookCode,
        mode: adjustMode,
        quantity: qty,
        reason: adjustReason.trim() || undefined,
      });

      if (res.data.success) {
        success(res.data.message || 'Stock successfully update ho gaya!');
        setAdjustModalBook(null);
        fetchStock(page);
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Stock adjust karne me samasya aayi');
    } finally {
      setIsAdjusting(false);
    }
  };

  // Keep a negative stock balance until it has been reconciled with inward stock.
  const initiateDelete = (book: any) => {
    if (book.availableQuantity !== 0) {
      error(`Book record tabhi delete ho sakta hai jab stock balance 0 ho. Current balance: ${book.availableQuantity}.`);
      return;
    }
    setDeleteModalBook(book);
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalBook) return;
    setIsDeleting(true);
    try {
      const res = await api.delete(`/stock/book/${encodeURIComponent(deleteModalBook.bookCode)}`);
      if (res.data.success) {
        success(res.data.message || `Book "${deleteModalBook.bookName}" successfully delete ho gayi!`);
        setDeleteModalBook(null);
        fetchStock(page);
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Book delete karne me samasya aayi');
    } finally {
      setIsDeleting(false);
    }
  };

  // Open Edit Book Modal
  const handleOpenEditModal = (book: any) => {
    setEditModalBook(book);
    setEditBookCode(book.bookCode || '');
    setEditBookName(book.bookName || '');
    setEditProductCode(book.productCode || '');
    setEditAvailableQty(String(book.availableQuantity ?? 0));
    setEditThreshold(String(book.lowStockThreshold ?? 10));
  };

  // Submit Edit Book Form
  const handleEditBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalBook) return;
    if (!editBookCode.trim()) {
      error('Book Code / Barcode darj karein');
      return;
    }
    if (!editBookName.trim()) {
      error('Book Name / Title darj karein');
      return;
    }

    setIsUpdatingBook(true);
    try {
      const res = await api.put(`/stock/book/${encodeURIComponent(editModalBook.bookCode)}`, {
        bookCode: editBookCode.trim(),
        bookName: editBookName.trim(),
        productCode: editProductCode.trim(),
        availableQuantity: parseInt(editAvailableQty, 10),
        lowStockThreshold: parseInt(editThreshold, 10),
      });

      if (res.data.success) {
        success(res.data.message || 'Book details successfully update ho gayi hain!');
        setEditModalBook(null);
        fetchStock(page);
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Book details update karne me samasya aayi');
    } finally {
      setIsUpdatingBook(false);
    }
  };

  // Export to Excel
  const handleExportStockExcel = async () => {
    try {
      const res = await api.get('/stock/export/available', { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Available_Warehouse_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      error('Export failed');
    }
  };

  // Clear All Stock
  const handleClearAllStock = async () => {
    if (!window.confirm('⚠️ KYA AAP SURE HAIN? Yeh sabhi Books ka Available Stock aur stock inward history data delete kar dega!')) {
      return;
    }
    try {
      const res = await api.delete('/stock/clear-all');
      if (res.data.success) {
        success('Sabhi stock records successfully delete ho gaye hain!');
        fetchStock(1);
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Stock delete karne me samasya aayi');
    }
  };

  const invertUrl = isAdmin ? '/admin/invert' : '/employee/invert';

  return (
    <div className="space-y-6">
      {/* ─── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">📊 Available Stock Master (उपलब्ध स्टॉक)</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Live Warehouse Inventory
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Warehouse me live bachi hui kitabein. Stock inward hone par count badhta hai, outgoing dispatch hone par count kam hota hai.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleClearAllStock}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              title="Reset all stock data"
            >
              <Trash2 size={14} />
              <span>Reset Stock Data</span>
            </button>
          )}

          <Button
            variant="secondary"
            onClick={handleExportStockExcel}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <Download size={14} />
            <span>Export Stock Excel</span>
          </Button>

          <button
            onClick={() => navigate(invertUrl)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <PackagePlus size={15} />
            <span>📥 Go to Stock Inward</span>
          </button>
        </div>
      </div>

      {/* ─── KPI Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Available Copies */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs">
          <p className="text-xs font-medium text-emerald-100">Live Available Books</p>
          <p className="text-2xl font-black mt-1">{summary.totalAvailableCopies || 0}</p>
          <p className="text-[11px] text-emerald-100/90 mt-0.5">Ready for dispatch</p>
        </div>

        {/* Total Book Titles */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Total Book Titles</p>
            <BookOpen size={16} className="text-red-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-1">{summary.totalTitles || 0}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Unique book SKUs</p>
        </div>

        {/* In Stock Titles */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">In Stock Titles</p>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-1">{summary.inStockTitles || 0}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">&gt; 10 copies in stock</p>
        </div>

        {/* Low Stock Titles */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Low Stock Titles</p>
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 mt-1">{summary.lowStockTitles || 0}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">1 to 10 copies left</p>
        </div>

        {/* Out of Stock Titles */}
        <div className="p-4 rounded-xl bg-white border border-rose-200 bg-rose-50/40 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-rose-700">Out of Stock</p>
            <XCircle size={16} className="text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 mt-1">{summary.outOfStockTitles || 0}</p>
          <p className="text-[11px] text-rose-700/80 font-medium mt-0.5">0 ya negative balance (scan record hua)</p>
        </div>

        {/* Total Dispatched */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Total Dispatched</p>
            <Truck size={16} className="text-purple-500" />
          </div>
          <p className="text-2xl font-black text-purple-700 mt-1">{summary.totalDispatchedCopies || 0}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Dispatched copies</p>
        </div>
      </div>

      {/* ─── Filter Bar ───────────────────────────────────────────────────────── */}
      <Card className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Books ({summary.totalTitles || 0})
            </button>
            <button
              onClick={() => setStatusFilter('IN_STOCK')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'IN_STOCK'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>In Stock ({summary.inStockTitles || 0})</span>
            </button>
            <button
              onClick={() => setStatusFilter('LOW_STOCK')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'LOW_STOCK'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle size={13} />
              <span>Low Stock ({summary.lowStockTitles || 0})</span>
            </button>
            <button
              onClick={() => setStatusFilter('OUT_OF_STOCK')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'OUT_OF_STOCK'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              <XCircle size={13} />
              <span>Out of Stock ({summary.outOfStockTitles || 0})</span>
            </button>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Sort by:</span>
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field);
                setSortOrder(order as any);
              }}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="availableQuantity-asc">Available Stock: Low to High</option>
              <option value="availableQuantity-desc">Available Stock: High to Low</option>
              <option value="bookName-asc">Book Name (A to Z)</option>
              <option value="lastRestockedAt-desc">Recently Restocked</option>
            </select>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
              title="Items per page"
            >
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
            <button
              onClick={() => fetchStock(page)}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by book code (e.g. IAEBR-001) or book name..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <Button type="submit" variant="primary" className="text-xs py-2">
            Search
          </Button>
          {search && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSearch('');
                fetchStock(1);
              }}
              className="text-xs py-2"
            >
              Reset
            </Button>
          )}
        </form>
      </Card>

      {/* ─── Available Stock Table ────────────────────────────────────────────── */}
      <Card className="p-0 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-xs">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400 font-medium">
            <LoadingSpinner />
            <p className="mt-2 text-xs">Loading available warehouse stock...</p>
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Boxes size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-sm">Koi stock record nahi mila</p>
            <p className="text-xs text-slate-400 mt-1">
              Stock Inward page par jakar nayi kitabon ka stock add karein.
            </p>
            <button
              onClick={() => navigate(invertUrl)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 cursor-pointer"
            >
              <PackagePlus size={14} />
              <span>📥 Go to Stock Inward Entry</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-white font-bold">
                <tr>
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Book Code / Barcode</th>
                  <th className="py-3 px-3">Book Name</th>
                  <th className="py-3 px-3 text-center">Total Inward</th>
                  <th className="py-3 px-3 text-center">Total Dispatched</th>
                  <th className="py-3 px-3 text-center font-black">Available Stock</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3">Last Restocked</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {books.map((b, idx) => {
                  const isOutOfStock = b.availableQuantity <= 0;
                  const isLowStock = b.availableQuantity > 0 && b.availableQuantity <= (b.lowStockThreshold || 10);

                  return (
                    <tr
                      key={b.id || b.bookCode}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isOutOfStock ? 'bg-rose-50/20' : isLowStock ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                        {(page - 1) * limit + idx + 1}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold px-2 py-0.5 rounded bg-red-50 text-red-900 border border-red-200 text-xs">
                          {b.bookCode}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800 max-w-sm truncate" title={b.bookName}>
                        {b.bookName}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-600 font-medium">
                        {b.totalInward}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-600 font-medium">
                        {b.totalDispatched}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-black shadow-2xs ${
                            isOutOfStock
                              ? 'bg-rose-100 text-rose-900 border border-rose-300 animate-pulse'
                              : isLowStock
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          }`}
                        >
                          {b.availableQuantity} copies
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            <XCircle size={12} />
                            <span>{b.availableQuantity < 0 ? 'Negative Stock' : 'Out of Stock'}</span>
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertTriangle size={12} />
                            <span>Low Stock</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 size={12} />
                            <span>In Stock</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-slate-500 text-[11px]">
                        {b.lastRestockedAt ? (
                          <>
                            <div className="font-semibold text-slate-700">
                              {new Date(b.lastRestockedAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                            <div className="font-mono text-slate-400">
                              {new Date(b.lastRestockedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(b)}
                            className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 bg-amber-50 text-amber-800 hover:bg-amber-600 hover:text-white rounded border border-amber-200 transition-colors cursor-pointer"
                            title="Edit Book Code, Name, Product Combo & Stock Details"
                          >
                            <Edit3 size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => setHistoryModalBook(b)}
                            className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded border border-blue-200 transition-colors cursor-pointer shadow-2xs"
                            title="View complete history of this book (कब-कब कितनी आई, कितनी गई)"
                          >
                            <History size={13} />
                            <span>History</span>
                          </button>
                          <button
                            onClick={() => openAdjustModal(b, 'SET')}
                            className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded border border-indigo-200 transition-colors cursor-pointer"
                            title="Stock update / kam-jyada karein (Set exact, Reduce or Add)"
                          >
                            <Sliders size={13} />
                            <span>Update / कम-ज्यादा</span>
                          </button>
                          <button
                            onClick={() => setQuickRestockBook(b)}
                            className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded border border-emerald-200 transition-colors cursor-pointer"
                            title="Quick Inward stock for this book"
                          >
                            <PlusCircle size={13} />
                            <span>+ Add</span>
                          </button>
                          <button
                            onClick={() => initiateDelete(b)}
                            disabled={b.availableQuantity !== 0}
                            className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border transition-colors ${
                              b.availableQuantity === 0
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white border-rose-200 cursor-pointer'
                                : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                            }`}
                            title={
                              b.availableQuantity === 0
                                ? 'Delete this 0-stock book record'
                                : `Reconcile stock to 0 before deleting (Current: ${b.availableQuantity})`
                            }
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100 text-xs text-slate-500">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => fetchStock(page - 1)}
                className="py-1 px-3 text-xs"
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => fetchStock(page + 1)}
                className="py-1 px-3 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Quick Restock Modal ──────────────────────────────────────────────── */}
      {quickRestockBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">📥 Quick Stock Inward</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Direct stock addition to live warehouse count
                </p>
              </div>
              <button
                onClick={() => setQuickRestockBook(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
              <p>
                Book Code: <strong className="font-mono text-red-700">{quickRestockBook.bookCode}</strong>
              </p>
              <p className="font-semibold text-slate-800">{quickRestockBook.bookName}</p>
              <p className="text-emerald-700 font-bold">
                Current Live Stock: {quickRestockBook.availableQuantity} copies
              </p>
            </div>

            <form onSubmit={handleQuickRestockSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quantity Arrived (कितनी किताबें जोड़नी हैं?) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={quickQty}
                  onChange={(e) => setQuickQty(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-emerald-400 rounded-lg text-sm font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  autoFocus
                />
              </div>

              {/* Quick Pills */}
              <div className="flex items-center gap-1.5 text-xs">
                {[20, 50, 100, 200, 500].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQuickQty(n.toString())}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 rounded font-semibold text-[11px] cursor-pointer"
                  >
                    +{n}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Supplier / Printer (वेंडर)
                </label>
                <input
                  type="text"
                  value={quickSupplier}
                  onChange={(e) => setQuickSupplier(e.target.value)}
                  placeholder="e.g. Printer / Warehouse"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setQuickRestockBook(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isQuickSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {isQuickSubmitting ? <LoadingSpinner /> : 'Confirm & Add Stock'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Comprehensive Stock Adjustment Modal (Set / Reduce / Add) ────────── */}
      {adjustModalBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sliders size={18} className="text-indigo-600" />
                  <span>Stock Adjustment (स्टॉक कम या ज्यादा करें)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live warehouse count update, reduction (kam karna) ya direct set karein
                </p>
              </div>
              <button
                onClick={() => setAdjustModalBook(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Current Book Info Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Book Code / Barcode:</span>
                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {adjustModalBook.bookCode}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Book Name:</span>
                <span className="font-bold text-slate-800 text-right max-w-[280px] truncate" title={adjustModalBook.bookName}>
                  {adjustModalBook.bookName}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-600 font-bold">Current Live Stock:</span>
                <span className="text-base font-black text-slate-900">
                  {adjustModalBook.availableQuantity || 0} <span className="text-xs font-normal text-slate-500">copies</span>
                </span>
              </div>
            </div>

            {/* Mode Selector Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setAdjustMode('SET');
                  setAdjustQty(String(adjustModalBook.availableQuantity || 0));
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                  adjustMode === 'SET'
                    ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Edit3 size={13} />
                  <span>Set Exact Total</span>
                </div>
                <span className="text-[10px] font-normal text-slate-400">सीधा नया स्टॉक</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdjustMode('REDUCE');
                  setAdjustQty('5');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                  adjustMode === 'REDUCE'
                    ? 'bg-white text-rose-700 shadow-xs border border-rose-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-1">
                  <MinusCircle size={13} />
                  <span>Reduce (कम करें)</span>
                </div>
                <span className="text-[10px] font-normal text-slate-400">खराब / डैमेज / वापसी</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdjustMode('ADD');
                  setAdjustQty('20');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                  adjustMode === 'ADD'
                    ? 'bg-white text-emerald-700 shadow-xs border border-emerald-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-1">
                  <PlusCircle size={13} />
                  <span>Add (बढ़ाएं)</span>
                </div>
                <span className="text-[10px] font-normal text-slate-400">नया स्टॉक आया</span>
              </button>
            </div>

            {/* Adjustment Form */}
            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              {/* Input Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {adjustMode === 'SET' && 'New Total Available Stock (नया कुल स्टॉक कितना है?) *'}
                  {adjustMode === 'REDUCE' && 'Quantity to Reduce (कितनी किताबें घटानी/कम करनी हैं?) *'}
                  {adjustMode === 'ADD' && 'Quantity to Add (कितनी किताबें जोड़नी हैं?) *'}
                </label>
                <input
                  type="number"
                  min="0"
                  max={adjustMode === 'REDUCE' ? adjustModalBook.availableQuantity : undefined}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className={`w-full px-3 py-2 border-2 rounded-lg text-base font-black focus:outline-none focus:ring-2 ${
                    adjustMode === 'REDUCE'
                      ? 'border-rose-300 text-rose-800 focus:ring-rose-500'
                      : adjustMode === 'ADD'
                      ? 'border-emerald-300 text-emerald-800 focus:ring-emerald-500'
                      : 'border-indigo-300 text-indigo-800 focus:ring-indigo-500'
                  }`}
                  required
                  autoFocus
                />
              </div>

              {/* Quick Preset Pills */}
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <span className="text-[11px] text-slate-400 font-medium">Quick values:</span>
                {adjustMode === 'SET' && (
                  [0, 10, 25, 50, 100, 200].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAdjustQty(n.toString())}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 rounded font-semibold text-[11px] cursor-pointer"
                    >
                      {n}
                    </button>
                  ))
                )}
                {adjustMode === 'REDUCE' && (
                  [1, 2, 5, 10, 20, 50].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAdjustQty(n.toString())}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800 rounded font-semibold text-[11px] cursor-pointer"
                    >
                      -{n}
                    </button>
                  ))
                )}
                {adjustMode === 'ADD' && (
                  [10, 20, 50, 100, 200, 500].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAdjustQty(n.toString())}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 rounded font-semibold text-[11px] cursor-pointer"
                    >
                      +{n}
                    </button>
                  ))
                )}
              </div>

              {/* Result Preview Box */}
              {(() => {
                const parsed = parseInt(adjustQty, 10);
                const current = adjustModalBook.availableQuantity || 0;
                let resulting = current;
                let isInvalid = false;

                if (!isNaN(parsed) && parsed >= 0) {
                  if (adjustMode === 'SET') {
                    resulting = parsed;
                  } else if (adjustMode === 'REDUCE') {
                    resulting = current - parsed;
                    if (parsed > current) isInvalid = true;
                  } else if (adjustMode === 'ADD') {
                    resulting = current + parsed;
                  }
                }

                return (
                  <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                    isInvalid
                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                      : 'bg-indigo-50/60 border-indigo-200 text-indigo-900'
                  }`}>
                    <div>
                      <p className="font-semibold">
                        {isInvalid ? '⚠️ Invalid Quantity!' : 'Resulting Live Stock Preview:'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {isInvalid
                          ? `Aapke paas keval ${current} copies hain. ${parsed} kam nahi kar sakte.`
                          : `Pehle: ${current} copies ➔ Update ke baad: ${resulting} copies`}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xl font-black ${
                        isInvalid
                          ? 'text-rose-600'
                          : resulting === 0
                          ? 'text-rose-600'
                          : resulting <= 10
                          ? 'text-amber-600'
                          : 'text-emerald-700'
                      }`}>
                        {isInvalid ? 'ERR' : resulting}
                      </span>
                      <span className="block text-[10px] text-slate-400">Final Stock</span>
                    </div>
                  </div>
                );
              })()}

              {/* Reason / Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason / Notes (कारण - ऐच्छिक)
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder={
                    adjustMode === 'REDUCE'
                      ? 'e.g. Damaged copies, water damage, sample distributed'
                      : adjustMode === 'SET'
                      ? 'e.g. Monthly physical audit count adjustment'
                      : 'e.g. Returned books added, extra stock found'
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAdjustModalBook(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isAdjusting ||
                    (adjustMode === 'REDUCE' && parseInt(adjustQty, 10) > (adjustModalBook.availableQuantity || 0))
                  }
                  className={`text-white font-bold cursor-pointer ${
                    adjustMode === 'REDUCE'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : adjustMode === 'ADD'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isAdjusting ? (
                    <LoadingSpinner />
                  ) : adjustMode === 'REDUCE' ? (
                    `Confirm & Reduce (-${adjustQty || 0})`
                  ) : adjustMode === 'ADD' ? (
                    `Confirm & Add (+${adjustQty || 0})`
                  ) : (
                    'Confirm & Set New Stock'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Book Details Modal ────────────────────────────────────────── */}
      {editModalBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Book Details (किताब का विवरण बदलें)</h3>
                  <p className="text-xs text-slate-500">
                    Book Code, Name, Product Combo ya Stock details update karein
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalBook(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditBookSubmit} className="space-y-3.5">
              {/* Book Code / Barcode */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Book Code / Barcode (बारकोड कोड) *
                </label>
                <input
                  type="text"
                  value={editBookCode}
                  onChange={(e) => setEditBookCode(e.target.value.toUpperCase())}
                  placeholder="e.g. DTSM-002, AF-01..."
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase bg-amber-50/40"
                />
                <span className="text-[10px] text-slate-400">Yeh barcode code scanner gun se scan karne me use hota hai</span>
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
                  placeholder="e.g. DT Study Mate May27 Part - 01"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Product Combo Code (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Product / Course Combo Code (ऑप्शनल - किस कोर्स की किताब है)
                </label>
                <input
                  type="text"
                  value={editProductCode}
                  onChange={(e) => setEditProductCode(e.target.value.toUpperCase())}
                  placeholder="e.g. AFMEO-002, CA-FINAL-01..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase"
                />
              </div>

              {/* Grid: Available Quantity & Low Stock Alert */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Available Stock (उपलब्ध स्टॉक)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editAvailableQty}
                    onChange={(e) => setEditAvailableQty(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Low Stock Alert (कम स्टॉक चेतावनी)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editThreshold}
                    onChange={(e) => setEditThreshold(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isUpdatingBook}
                  onClick={() => setEditModalBook(null)}
                >
                  Cancel (रद्द करें)
                </Button>
                <Button
                  type="submit"
                  disabled={isUpdatingBook}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {isUpdatingBook ? <LoadingSpinner /> : <><Edit3 size={14} /><span>Save Changes (अपडेट करें)</span></>}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal (0 Stock Only) ───────────────────────── */}
      {deleteModalBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Book Record? (हटाएं)</h3>
                <p className="text-xs text-rose-600 font-semibold">
                  ⚠️ Yeh kitab master inventory se permanently delete ho jayegi
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Book Code / Barcode:</span>
                <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {deleteModalBook.bookCode}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Book Name:</span>
                <span className="font-bold text-slate-900 text-right max-w-[240px] truncate" title={deleteModalBook.bookName}>
                  {deleteModalBook.bookName}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-medium">Current Stock:</span>
                <span className="font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  {deleteModalBook.availableQuantity || 0} copies (Out of Stock)
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Kya aap sach me <strong className="text-slate-900">"{deleteModalBook.bookName}"</strong> ko inventory se delete karna chahte hain?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                disabled={isDeleting}
                onClick={() => setDeleteModalBook(null)}
              >
                Cancel (रद्द करें)
              </Button>
              <Button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {isDeleting ? <LoadingSpinner /> : <><Trash2 size={14} /><span>Yes, Delete (डिलीट करें)</span></>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Book Movement History Modal ────────────────────────────────────── */}
      <BookStockHistoryModal
        book={historyModalBook}
        isOpen={!!historyModalBook}
        onClose={() => setHistoryModalBook(null)}
        onStockUpdated={() => fetchStock(page)}
      />
    </div>
  );
};
export default AvailableStockPage;
