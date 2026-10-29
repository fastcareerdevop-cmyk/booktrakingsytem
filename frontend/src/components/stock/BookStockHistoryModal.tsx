import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { LoadingSpinner } from '../common/LoadingSpinner';
import {
  X,
  History,
  Download,
  RefreshCw,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Sliders,
  Clock,
  Calendar,
  User,
  Truck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Package,
  Layers,
  FileSpreadsheet,
  FileText,
  Boxes,
} from 'lucide-react';

export interface BookStockHistoryModalProps {
  book: {
    id?: string;
    bookCode: string;
    bookName: string;
    productCode?: string;
    availableQuantity?: number;
    totalInward?: number;
    totalDispatched?: number;
    lowStockThreshold?: number;
    lastRestockedAt?: string | Date;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onStockUpdated?: () => void;
}

export const BookStockHistoryModal: React.FC<BookStockHistoryModalProps> = ({
  book,
  isOpen,
  onClose,
  onStockUpdated,
}) => {
  const { success, error } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [historyData, setHistoryData] = useState<any>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT' | 'ADJUST' | 'PENDING'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const fetchHistory = async () => {
    if (!book) return;
    setLoading(true);
    try {
      const identifier = book.id || book.bookCode;
      const res = await api.get(`/stock/book/${encodeURIComponent(identifier)}/history`);
      if (res.data.success) {
        setHistoryData(res.data.data);
      }
    } catch (err: any) {
      console.error('Failed to load book history:', err);
      error(err.response?.data?.message || 'Kitab ka history load karne me samasya aayi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && book) {
      setSearchTerm('');
      setFilterType('ALL');
      fetchHistory();
    } else {
      setHistoryData(null);
    }
  }, [isOpen, book]);

  if (!isOpen || !book) return null;

  // Handle Export Excel for this single book's history
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const identifier = book.id || book.bookCode;
      const response = await api.get(`/stock/book/${encodeURIComponent(identifier)}/history/export`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${book.bookCode}-stock-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success('Book history Excel downloaded successfully!');
    } catch (err: any) {
      console.error('Failed to export history excel:', err);
      error('Excel download failed');
    } finally {
      setIsExporting(false);
    }
  };

  const currentBook = historyData?.book || book;
  const stats = historyData?.stats || {};
  const timeline: any[] = historyData?.timeline || [];
  const pendingRecords: any[] = historyData?.pendingRecords || [];

  // Filter timeline based on category tab & search
  const filteredTimeline = timeline.filter((item) => {
    // Tab filter
    if (filterType === 'IN' && item.category !== 'IN') return false;
    if (filterType === 'OUT' && item.category !== 'OUT') return false;
    if (
      filterType === 'ADJUST' &&
      item.type !== 'ADJUST_ADD' &&
      item.type !== 'ADJUST_REDUCE' &&
      !item.party?.includes('Adjustment') &&
      !item.party?.includes('समायोजन')
    ) {
      return false;
    }

    // Text search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchParty = (item.party || '').toLowerCase().includes(q);
      const matchRef = (item.reference || '').toLowerCase().includes(q);
      const matchRemarks = (item.remarks || '').toLowerCase().includes(q);
      const matchDate = (item.dateFormatted || '').toLowerCase().includes(q);
      const matchBy = (item.performedBy?.name || '').toLowerCase().includes(q);
      const matchType = (item.type || '').toLowerCase().includes(q);
      return matchParty || matchRef || matchRemarks || matchDate || matchBy || matchType;
    }

    return true;
  });

  const isOutOfStock = (currentBook.availableQuantity || 0) <= 0;
  const isLowStock =
    (currentBook.availableQuantity || 0) > 0 &&
    (currentBook.availableQuantity || 0) <= (currentBook.lowStockThreshold || 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* ─── Modal Header ────────────────────────────────────────────── */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
              <History size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-black text-xs px-2.5 py-0.5 rounded bg-blue-500 text-white shadow-2xs">
                  {currentBook.bookCode}
                </span>
                {currentBook.productCode && (
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Combo: {currentBook.productCode}
                  </span>
                )}
                <span className="text-xs text-slate-400">Complete Movement History (किताब का पूरा इतिहास)</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white truncate max-w-xl mt-0.5" title={currentBook.bookName}>
                {currentBook.bookName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportExcel}
              disabled={isExporting || loading}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              title="Download this book's complete history in Excel"
            >
              {isExporting ? <LoadingSpinner /> : <FileSpreadsheet size={14} />}
              <span>Download Excel</span>
            </button>
            <button
              onClick={fetchHistory}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Refresh History"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Close Modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── Summary KPI Cards ────────────────────────────────────────── */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Live Available Stock */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Available Stock (उपलब्ध)</span>
                <Boxes size={14} className="text-slate-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-black ${
                    isOutOfStock
                      ? 'text-rose-600'
                      : isLowStock
                      ? 'text-amber-600'
                      : 'text-emerald-700'
                  }`}
                >
                  {currentBook.availableQuantity ?? 0}
                </span>
                <span className="text-xs font-semibold text-slate-500">copies</span>
              </div>
              <div className="mt-1">
                {isOutOfStock ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                    <XCircle size={10} /> {currentBook.availableQuantity < 0 ? 'Negative Stock' : 'Out of Stock'}
                  </span>
                ) : isLowStock ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle size={10} /> Low Stock (≤{currentBook.lowStockThreshold || 10})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 size={10} /> In Stock
                  </span>
                )}
              </div>
            </div>

            {/* 2. Total Inward / Added */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Total Inward (कुल आई)</span>
                <ArrowDownLeft size={14} className="text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600">
                  +{currentBook.totalInward ?? 0}
                </span>
                <span className="text-xs font-semibold text-slate-500">copies</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400 font-medium">
                {stats.inwardTransactionsCount ?? 0} inward entries recorded
              </div>
            </div>

            {/* 3. Total Dispatched / Outgoing */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Total Dispatched (कुल गई)</span>
                <ArrowUpRight size={14} className="text-rose-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-rose-600">
                  -{currentBook.totalDispatched ?? 0}
                </span>
                <span className="text-xs font-semibold text-slate-500">copies</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400 font-medium">
                {stats.dispatchTransactionsCount ?? 0} student dispatches
              </div>
            </div>

            {/* 4. Movements & Restock */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Last Activity (अंतिम हलचल)</span>
                <Clock size={14} className="text-indigo-400" />
              </div>
              <div className="mt-1.5">
                {currentBook.lastRestockedAt ? (
                  <>
                    <div className="text-xs font-bold text-slate-800">
                      {new Date(currentBook.lastRestockedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {new Date(currentBook.lastRestockedAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">No date recorded</span>
                )}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-indigo-600">
                {stats.timelineEventsCount ?? timeline.length} Total Event(s)
              </div>
            </div>
          </div>
        </div>

        {/* ─── Search & Tab Filters ────────────────────────────────────── */}
        <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-bold">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                filterType === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All History (सभी: {timeline.length})
            </button>
            <button
              onClick={() => setFilterType('IN')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                filterType === 'IN'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <ArrowDownLeft size={13} />
              <span>Stock Added (आई: {stats.inwardTransactionsCount ?? 0})</span>
            </button>
            <button
              onClick={() => setFilterType('OUT')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                filterType === 'OUT'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              <ArrowUpRight size={13} />
              <span>Stock Reduced (गई: {stats.dispatchTransactionsCount ?? 0})</span>
            </button>
            <button
              onClick={() => setFilterType('ADJUST')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                filterType === 'ADJUST'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
              }`}
            >
              <Sliders size={13} />
              <span>Adjustments ({stats.adjustmentTransactionsCount ?? 0})</span>
            </button>
            {pendingRecords.length > 0 && (
              <button
                onClick={() => setFilterType('PENDING')}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                  filterType === 'PENDING'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <Clock size={13} />
                <span>Pending Orders ({pendingRecords.length})</span>
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by date, supplier, student, tracking..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ─── Modal Body: Timeline Table ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
              <LoadingSpinner />
              <p className="text-xs font-medium">Loading complete history of "{book.bookCode}"...</p>
            </div>
          ) : filterType === 'PENDING' ? (
            /* Pending Orders View */
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Pending Print / Vendor Orders for this Book ({pendingRecords.length})</span>
                <span className="text-[11px] text-slate-400 font-normal">Pending book tracking records</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-white font-bold">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Order Date</th>
                      <th className="py-2.5 px-3">Printer / Vendor</th>
                      <th className="py-2.5 px-3 text-center">Pending Qty</th>
                      <th className="py-2.5 px-3 text-center">Received Qty</th>
                      <th className="py-2.5 px-3">Expected Date</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {pendingRecords.map((p, idx) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-700 font-medium">
                          {new Date(p.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{p.printerOrVendor || '-'}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-700">
                          {p.pendingQuantity} copies
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                          {p.receivedQuantity || 0} copies
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {p.expectedDate
                            ? new Date(p.expectedDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              p.status === 'RECEIVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : p.status === 'CANCELLED'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{p.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : filteredTimeline.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <History size={36} className="mx-auto text-slate-300 stroke-[1.5]" />
              <p className="text-sm font-bold text-slate-700">Koi history record nahi mila</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {searchTerm
                  ? `Search term "${searchTerm}" ke liye koi result nahi mila. Search clear karke dekhein.`
                  : 'Is kitab ke liye abhi tak koi stock inward ya outgoing dispatch entry record nahi hui hai.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-white font-bold">
                  <tr>
                    <th className="py-3 px-3 w-10">#</th>
                    <th className="py-3 px-3 whitespace-nowrap">Date & Time (तारीख)</th>
                    <th className="py-3 px-3">Activity Type (प्रकार)</th>
                    <th className="py-3 px-3 text-center">Stock Change (प्रतियां)</th>
                    <th className="py-3 px-3">Source / Party (कहाँ से / किसको)</th>
                    <th className="py-3 px-3">Reference / Remarks (विवरण)</th>
                    <th className="py-3 px-3 whitespace-nowrap">Done By (किसने किया)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredTimeline.map((item, idx) => {
                    const isPositive = item.quantityChange > 0;
                    const isDispatch = item.type === 'DISPATCH';
                    const isAdjustment = item.type === 'ADJUST_ADD' || item.type === 'ADJUST_REDUCE';

                    return (
                      <tr
                        key={item.id || idx}
                        className={`hover:bg-slate-50/90 transition-colors ${
                          isPositive ? 'bg-emerald-50/15' : isDispatch ? 'bg-rose-50/15' : 'bg-indigo-50/15'
                        }`}
                      >
                        {/* 1. S.No */}
                        <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>

                        {/* 2. Date & Time */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-bold text-slate-800">{item.dateFormatted}</div>
                          <div className="font-mono text-slate-400 text-[11px]">{item.timeFormatted}</div>
                        </td>

                        {/* 3. Activity Type Badge */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {item.type === 'INWARD' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                              <ArrowDownLeft size={12} className="text-emerald-700" />
                              <span>Stock Inward (आवक)</span>
                            </span>
                          ) : item.type === 'DISPATCH' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                              <ArrowUpRight size={12} className="text-rose-700" />
                              <span>Order Dispatched (जावक)</span>
                            </span>
                          ) : item.type === 'ADJUST_ADD' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 shadow-2xs">
                              <Sliders size={12} className="text-indigo-700" />
                              <span>Stock Adjustment (+)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                              <Sliders size={12} className="text-amber-700" />
                              <span>Stock Adjustment (-)</span>
                            </span>
                          )}
                        </td>

                        {/* 4. Stock Change Quantity */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-black shadow-2xs ${
                              isPositive
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'bg-rose-100 text-rose-900 border border-rose-300'
                            }`}
                          >
                            {isPositive ? `+${item.quantityChange}` : item.quantityChange} copies
                          </span>
                        </td>

                        {/* 5. Source / Party */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800 max-w-xs truncate" title={item.party}>
                            {item.party}
                          </div>
                          {item.source && (
                            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                              via {item.source}
                            </div>
                          )}
                        </td>

                        {/* 6. Reference / Remarks */}
                        <td className="py-3 px-3 text-slate-600 max-w-sm">
                          <div className="truncate font-medium text-slate-700" title={item.reference}>
                            {item.reference}
                          </div>
                          {item.remarks && item.remarks !== item.reference && (
                            <div className="text-[11px] text-slate-400 italic truncate" title={item.remarks}>
                              {item.remarks}
                            </div>
                          )}
                        </td>

                        {/* 7. Done By */}
                        <td className="py-3 px-3 whitespace-nowrap text-slate-500">
                          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                            <User size={12} className="text-slate-400" />
                            <span>{item.performedBy?.name || 'Admin'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ─── Modal Footer ────────────────────────────────────────────── */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500 font-medium">
            Showing <strong className="text-slate-900">{filteredTimeline.length}</strong> of{' '}
            <strong className="text-slate-900">{timeline.length}</strong> recorded movements
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting || loading || timeline.length === 0}
              className="sm:hidden inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors cursor-pointer"
            >
              <FileSpreadsheet size={13} />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold transition-colors cursor-pointer"
            >
              Close (बंद करें)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
