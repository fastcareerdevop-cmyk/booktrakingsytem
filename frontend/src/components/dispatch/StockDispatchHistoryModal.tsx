import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { LoadingSpinner } from '../common/LoadingSpinner';
import {
  X,
  BarChart2,
  Calendar,
  RefreshCw,
  Search,
  ArrowUpRight,
  Package,
  ChevronDown,
  ChevronRight,
  Truck,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface DispatchEntry {
  id: string;
  dispatchedAt: string;
  studentName: string;
  trackingId: string;
  orderCode: string;
  mobileNumber: string;
  employeeName: string;
  quantity: number;
}

interface StockRow {
  bookCode: string;
  bookName: string;
  productCode: string;
  openingStock: number;
  totalDispatchedToday: number;
  closingStock: number;
  totalInward: number;
  totalDispatchedAllTime: number;
  dispatches: DispatchEntry[];
}

interface HistoryData {
  date: string;
  dateLabel: string;
  totalBooksDispatched: number;
  totalOrdersProcessed: number;
  uniqueBookTitles: number;
  rows: StockRow[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const StockDispatchHistoryModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HistoryData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [bookSearch, setBookSearch] = useState('');
  const [expandedBook, setExpandedBook] = useState<string | null>(null);

  const fetchHistory = async (date: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date });
      const res = await api.get(`/dispatch/stock-history?${params}`);
      if (res.data.success) setData(res.data.data);
    } catch (err: any) {
      console.error('Failed to load stock history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchHistory(selectedDate);
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredRows = (data?.rows || []).filter((r) => {
    const q = bookSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      r.bookCode.toLowerCase().includes(q) ||
      r.bookName.toLowerCase().includes(q) ||
      r.productCode.toLowerCase().includes(q)
    );
  });

  const handleExportExcel = () => {
    if (!data) return;
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryRows = filteredRows.map((r, idx) => ({
      'S.No': idx + 1,
      'Book Code': r.bookCode,
      'Book Name': r.bookName,
      'Product Code': r.productCode || '-',
      'Opening Stock (Before Dispatch)': r.openingStock,
      'Dispatched Today': r.totalDispatchedToday,
      'Closing Stock (After Dispatch)': r.closingStock,
      'Total Inward (All Time)': r.totalInward,
      'Total Dispatched (All Time)': r.totalDispatchedAllTime,
    }));
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    summarySheet['!cols'] = [
      { wch: 6 }, { wch: 20 }, { wch: 36 }, { wch: 18 },
      { wch: 26 }, { wch: 18 }, { wch: 26 }, { wch: 22 }, { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(workbook, summarySheet, `Stock Summary ${data.date}`);

    // Sheet 2: Detailed dispatches
    const detailRows: any[] = [];
    filteredRows.forEach((r) => {
      r.dispatches.forEach((d) => {
        detailRows.push({
          'Book Code': r.bookCode,
          'Book Name': r.bookName,
          'Student Name': d.studentName,
          'Tracking ID': d.trackingId,
          'Order Code': d.orderCode,
          'Mobile': d.mobileNumber,
          'Dispatched By': d.employeeName,
          'Time': new Date(d.dispatchedAt).toLocaleTimeString('en-IN'),
          'Qty': d.quantity,
        });
      });
    });
    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    detailSheet['!cols'] = [
      { wch: 18 }, { wch: 34 }, { wch: 22 }, { wch: 16 },
      { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 6 },
    ];
    XLSX.utils.book_append_sheet(workbook, detailSheet, `Dispatch Detail ${data.date}`);

    XLSX.writeFile(workbook, `Stock_Dispatch_History_${data.date}.xlsx`);
  };

  const getStockStatus = (closing: number) => {
    if (closing <= 0) return { label: 'Out of Stock', cls: 'bg-rose-100 text-rose-800 border-rose-300', icon: <XCircle size={11} /> };
    if (closing <= 10) return { label: 'Low Stock', cls: 'bg-amber-100 text-amber-800 border-amber-300', icon: <AlertTriangle size={11} /> };
    return { label: 'In Stock', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: <CheckCircle2 size={11} /> };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[94vh]">

        {/* ─── Header ─── */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
              <BarChart2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">📊 Stock Dispatch History</h2>
              <p className="text-xs text-slate-400">Date-wise: Kitni thi → Kitni gayi → Kitni bachi</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {data && (
              <button
                onClick={handleExportExcel}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                title="Download Excel"
              >
                <Download size={13} />
                <span>Export Excel</span>
              </button>
            )}
            <button
              onClick={() => fetchHistory(selectedDate)}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── Date Picker + Search ─── */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-slate-500 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                fetchHistory(e.target.value);
              }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={bookSearch}
              onChange={(e) => setBookSearch(e.target.value)}
              placeholder="Filter book code / name..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* ─── KPI Cards ─── */}
        {data && !loading && (
          <div className="px-5 py-3 bg-white border-b border-slate-100 shrink-0">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wide">Total Dispatched</p>
                <p className="text-2xl font-black text-rose-700 mt-0.5">{data.totalBooksDispatched}</p>
                <p className="text-[10px] text-rose-500">copies aaj gayi</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Orders Processed</p>
                <p className="text-2xl font-black text-blue-700 mt-0.5">{data.totalOrdersProcessed}</p>
                <p className="text-[10px] text-blue-500">students ko diye</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Book Titles</p>
                <p className="text-2xl font-black text-indigo-700 mt-0.5">{data.uniqueBookTitles}</p>
                <p className="text-[10px] text-indigo-500">alag book codes</p>
              </div>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 mt-2">
              📅 {data.dateLabel}
            </p>
          </div>
        )}

        {/* ─── Body ─── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
              <LoadingSpinner />
              <p className="text-xs font-medium">Loading dispatch history...</p>
            </div>
          ) : !data || filteredRows.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Truck size={40} className="mx-auto text-slate-300 stroke-[1.5]" />
              <p className="text-sm font-bold text-slate-700">Is date pe koi dispatch nahi mili</p>
              <p className="text-xs text-slate-400">
                {bookSearch ? `"${bookSearch}" ke liye koi result nahi. Filter clear karein.` : 'Doosri date try karein.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-2 bg-slate-900 text-white text-[10px] font-bold rounded-lg uppercase tracking-wide">
                <div>Book</div>
                <div className="text-center">Opening Stock</div>
                <div className="text-center text-rose-300">Dispatched</div>
                <div className="text-center text-emerald-300">Closing Stock</div>
                <div className="text-center">Status</div>
                <div className="text-center">Orders</div>
              </div>

              {filteredRows.map((row) => {
                const status = getStockStatus(row.closingStock);
                const isExpanded = expandedBook === row.bookCode;

                return (
                  <div key={row.bookCode} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Main Row */}
                    <div
                      className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-3 bg-white hover:bg-slate-50/80 transition-colors cursor-pointer items-center"
                      onClick={() => setExpandedBook(isExpanded ? null : row.bookCode)}
                    >
                      {/* Book info */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-slate-400 shrink-0">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-black text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-800 border border-red-200">
                              {row.bookCode}
                            </span>
                            {row.productCode && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {row.productCode}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-semibold text-slate-800 mt-0.5 truncate" title={row.bookName}>
                            {row.bookName}
                          </p>
                        </div>
                      </div>

                      {/* Opening Stock */}
                      <div className="text-center">
                        <span className="text-sm font-black text-slate-700">{row.openingStock}</span>
                        <p className="text-[9px] text-slate-400 sm:hidden">Opening</p>
                      </div>

                      {/* Dispatched */}
                      <div className="text-center">
                        <span className="text-sm font-black text-rose-600">-{row.totalDispatchedToday}</span>
                        <p className="text-[9px] text-slate-400 sm:hidden">Dispatched</p>
                      </div>

                      {/* Closing Stock */}
                      <div className="text-center">
                        <span className={`text-sm font-black ${
                          row.closingStock <= 0 ? 'text-rose-600' : row.closingStock <= 10 ? 'text-amber-600' : 'text-emerald-700'
                        }`}>
                          {row.closingStock}
                        </span>
                        <p className="text-[9px] text-slate-400 sm:hidden">Closing</p>
                      </div>

                      {/* Status */}
                      <div className="flex justify-center">
                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded border ${status.cls}`}>
                          {status.icon}
                          <span className="hidden sm:inline">{status.label}</span>
                        </span>
                      </div>

                      {/* Orders count */}
                      <div className="text-center">
                        <span className="text-xs font-bold text-slate-600">{row.dispatches.length}</span>
                        <p className="text-[9px] text-slate-400">orders</p>
                      </div>
                    </div>

                    {/* Expanded: individual dispatches */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/60">
                        <div className="px-3 py-2 text-[10px] font-bold text-slate-600 bg-slate-100 flex items-center gap-1.5">
                          <ArrowUpRight size={12} className="text-rose-500" />
                          Aaj ke {row.dispatches.length} dispatch records — {row.bookCode}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-900 text-white">
                              <tr>
                                <th className="py-2 px-3">#</th>
                                <th className="py-2 px-3">Time</th>
                                <th className="py-2 px-3">Student Name</th>
                                <th className="py-2 px-3">Tracking ID</th>
                                <th className="py-2 px-3">Order Code</th>
                                <th className="py-2 px-3">Mobile</th>
                                <th className="py-2 px-3 text-center">Qty</th>
                                <th className="py-2 px-3">Dispatched By</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {row.dispatches.map((d, idx) => (
                                <tr key={d.id || idx} className="hover:bg-slate-50">
                                  <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                                  <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                                    {new Date(d.dispatchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                  </td>
                                  <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">{d.studentName}</td>
                                  <td className="py-2 px-3 font-mono text-slate-600">{d.trackingId || '-'}</td>
                                  <td className="py-2 px-3 font-mono text-slate-500">{d.orderCode || '-'}</td>
                                  <td className="py-2 px-3 text-slate-600">{d.mobileNumber || '-'}</td>
                                  <td className="py-2 px-3 text-center">
                                    <span className="font-black text-rose-700">{d.quantity}</span>
                                  </td>
                                  <td className="py-2 px-3 text-slate-500">{d.employeeName}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
          <div className="text-slate-500 font-medium">
            Showing <strong className="text-slate-900">{filteredRows.length}</strong> book title(s)
            {data && ` — ${data.dateLabel}`}
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <button
                onClick={handleExportExcel}
                className="sm:hidden inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold cursor-pointer"
              >
                <Download size={12} />
                <span>Excel</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold cursor-pointer transition-colors"
            >
              Close (बंद करें)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

