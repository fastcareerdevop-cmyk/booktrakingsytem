import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Pagination } from '../../components/common/Pagination';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import {
  Clock,
  PlusCircle,
  Search,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Truck,
  Trash2,
  Edit3,
  Calendar,
  PackageCheck,
  RefreshCw,
  Building2,
  BookOpen,
  ArrowRight,
} from 'lucide-react';

export const PendingStockPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();

  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'RECEIVED'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'NORMAL' | 'HIGH' | 'URGENT'>('ALL');
  const [limit, setLimit] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [summary, setSummary] = useState<any>({
    totalEntries: 0,
    totalPendingCopies: 0,
    totalReceivedCopies: 0,
    urgentCount: 0,
  });

  // Add/Edit Modal
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formBookCode, setFormBookCode] = useState<string>('');
  const [formBookName, setFormBookName] = useState<string>('');
  const [formQuantity, setFormQuantity] = useState<string>('50');
  const [formPrinter, setFormPrinter] = useState<string>('');
  const [formExpectedDate, setFormExpectedDate] = useState<string>('');
  const [formPriority, setFormPriority] = useState<'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [formRemarks, setFormRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Receive Modal
  const [receiveItem, setReceiveItem] = useState<any>(null);
  const [receiveQty, setReceiveQty] = useState<string>('0');
  const [receiveRemarks, setReceiveRemarks] = useState<string>('');
  const [isReceiving, setIsReceiving] = useState<boolean>(false);

  // Delete Modal
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchPendingBooks = async (targetPage = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', targetPage.toString());
      params.append('limit', limit.toString());
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (priorityFilter !== 'ALL') params.append('priority', priorityFilter);

      const res = await api.get(`/stock/pending?${params.toString()}`);
      if (res.data.success) {
        setItems(res.data.data.items || []);
        setSummary(res.data.data.summary || {});
        setTotalPages(res.data.data.pagination.totalPages || 1);
        setTotalRecords(res.data.data.pagination.total || 0);
        setPage(targetPage);
      }
    } catch (err: any) {
      console.error('Failed to fetch pending books:', err);
      error('Pending books load karne me samasya aayi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingBooks(1);
  }, [statusFilter, priorityFilter, limit]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPendingBooks(1);
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormBookCode('');
    setFormBookName('');
    setFormQuantity('50');
    setFormPrinter('');
    setFormExpectedDate('');
    setFormPriority('NORMAL');
    setFormRemarks('');
    setIsFormModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setFormBookCode(item.bookCode);
    setFormBookName(item.bookName);
    setFormQuantity(String(item.pendingQuantity));
    setFormPrinter(item.printerOrVendor === '-' ? '' : item.printerOrVendor);
    setFormExpectedDate(item.expectedDate ? item.expectedDate.slice(0, 10) : '');
    setFormPriority(item.priority || 'NORMAL');
    setFormRemarks(item.remarks || '');
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(formQuantity, 10);
    if (!formBookCode.trim()) {
      error('Book Code darj karna zaroori hai');
      return;
    }
    if (!formBookName.trim()) {
      error('Book Name darj karna zaroori hai');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      error('Quantity kam se kam 1 honi chahiye');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        bookCode: formBookCode.trim().toUpperCase(),
        bookName: formBookName.trim(),
        pendingQuantity: qty,
        printerOrVendor: formPrinter.trim() || undefined,
        expectedDate: formExpectedDate || undefined,
        priority: formPriority,
        remarks: formRemarks.trim() || undefined,
      };

      if (editingItem) {
        const res = await api.put(`/stock/pending/${editingItem.id}`, payload);
        if (res.data.success) {
          success(res.data.message || 'Pending book record update ho gaya!');
          setIsFormModalOpen(false);
          fetchPendingBooks(page);
        }
      } else {
        const res = await api.post('/stock/pending', payload);
        if (res.data.success) {
          success(res.data.message || 'New pending book entry jud gayi!');
          setIsFormModalOpen(false);
          fetchPendingBooks(1);
        }
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Save karne me samasya aayi');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Receive stock into warehouse
  const openReceiveModal = (item: any) => {
    setReceiveItem(item);
    setReceiveQty(String(item.pendingQuantity));
    setReceiveRemarks('');
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveItem) return;
    const qty = parseInt(receiveQty, 10);
    if (isNaN(qty) || qty <= 0) {
      error('Received quantity kam se kam 1 honi chahiye');
      return;
    }

    setIsReceiving(true);
    try {
      const res = await api.post(`/stock/pending/${receiveItem.id}/receive`, {
        receivedQuantity: qty,
        remarks: receiveRemarks.trim() || undefined,
      });

      if (res.data.success) {
        success(res.data.message || 'Kitabein warehouse stock me jud gayi!');
        setReceiveItem(null);
        fetchPendingBooks(page);
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Stock receive karne me samasya aayi');
    } finally {
      setIsReceiving(false);
    }
  };

  // Delete pending record
  const handleDeleteSubmit = async () => {
    if (!deleteItem) return;
    setIsDeleting(true);
    try {
      const res = await api.delete(`/stock/pending/${deleteItem.id}`);
      if (res.data.success) {
        success(res.data.message || 'Pending record delete ho gaya!');
        setDeleteItem(null);
        fetchPendingBooks(page);
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Delete karne me samasya aayi');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">⏳ Pending Book Stock Master (पेंडिंग बुक स्टॉक)</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Under Printing & Expected Stock
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Printers, publishers ya reprint se aane wali pending kitabon ki entry yahan karein aur aane par sidha warehouse stock me transfer karein.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => fetchPendingBooks(page)}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </Button>

          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle size={15} />
            <span>+ Add Pending Book (नई पेंडिंग किताब)</span>
          </button>
        </div>
      </div>

      {/* ─── KPI Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Pending Copies */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-amber-100">Waiting for Arrival</p>
            <Clock size={16} className="text-amber-200" />
          </div>
          <p className="text-2xl font-black mt-1">{summary.totalPendingCopies || 0}</p>
          <p className="text-[11px] text-amber-100/90 mt-0.5">Total pending copies</p>
        </div>

        {/* Total Pending Entries */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Pending Titles</p>
            <BookOpen size={16} className="text-red-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-1">{summary.totalEntries || 0}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Unique books waiting</p>
        </div>

        {/* Urgent / High Priority */}
        <div className="p-4 rounded-xl bg-white border border-rose-200 bg-rose-50/30 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-rose-700">Urgent / High Priority</p>
            <Flame size={16} className="text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 mt-1">{summary.urgentCount || 0}</p>
          <p className="text-[11px] text-rose-700/80 font-medium mt-0.5">Critical student demand</p>
        </div>

        {/* Total Received Copies */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Total Arrived & Received</p>
            <PackageCheck size={16} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-1">{summary.totalReceivedCopies || 0}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Transferred to stock</p>
        </div>
      </div>

      {/* ─── Search & Filter Bar ─────────────────────────────────────────────── */}
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
              All Records ({summary.totalEntries || 0})
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <Clock size={13} />
              <span>Pending / Under Print</span>
            </button>
            <button
              onClick={() => setStatusFilter('RECEIVED')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'RECEIVED'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>Received (Completed)</span>
            </button>
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by code, title or vendor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 w-64 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>
      </Card>

      {/* ─── Pending Books Table ─────────────────────────────────────────────── */}
      <Card className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
        {isLoading ? (
          <div className="p-12 flex justify-center items-center">
            <LoadingSpinner />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Clock size={36} className="mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">Koi pending book record nahi mila</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Printers se aane wali kitabon ki entry karne ke liye upar "+ Add Pending Book" button dabayein.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white uppercase text-[11px] tracking-wider font-semibold">
                  <th className="py-3 px-3 w-10">#</th>
                  <th className="py-3 px-3">Book Code / Barcode</th>
                  <th className="py-3 px-3">Book Name</th>
                  <th className="py-3 px-3 text-center">Pending Qty</th>
                  <th className="py-3 px-3">Printer / Vendor</th>
                  <th className="py-3 px-3">Expected Date</th>
                  <th className="py-3 px-3 text-center">Priority</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3">Remarks</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => {
                  const isReceived = item.status === 'RECEIVED';
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                        {(page - 1) * 25 + index + 1}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                          {item.bookCode}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 max-w-xs truncate" title={item.bookName}>
                        {item.bookName}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className="font-black text-sm text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                          {item.pendingQuantity} copies
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                        {item.printerOrVendor !== '-' ? (
                          <span className="inline-flex items-center gap-1 font-medium">
                            <Building2 size={12} className="text-slate-400" />
                            <span>{item.printerOrVendor}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                        {item.expectedDate ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                            <Calendar size={12} className="text-amber-500" />
                            <span>{new Date(item.expectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {item.priority === 'URGENT' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            <Flame size={11} />
                            <span>URGENT</span>
                          </span>
                        ) : item.priority === 'HIGH' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertTriangle size={11} />
                            <span>HIGH</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            NORMAL
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {isReceived ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 size={11} />
                            <span>Received</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                            <Clock size={11} />
                            <span>Pending</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 max-w-[180px] truncate text-slate-500 text-[11px]" title={item.remarks}>
                        {item.remarks || '-'}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isReceived && (
                            <button
                              onClick={() => openReceiveModal(item)}
                              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded border border-emerald-200 transition-colors cursor-pointer"
                              title="Kitabein aane par warehouse stock me bhejein"
                            >
                              <PackageCheck size={13} />
                              <span>Receive Stock</span>
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-1 text-slate-500 hover:text-red-600 hover:bg-slate-100 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteItem(item)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
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

        {/* Customizable Pagination Bar */}
        <div className="p-4 border-t border-slate-100">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalRecords={totalRecords}
            pageSize={limit}
            onPageChange={(p) => fetchPendingBooks(p)}
            onPageSizeChange={(newLimit) => {
              setLimit(newLimit);
              setPage(1);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
            maxCustomLimit={100}
          />
        </div>
      </Card>

      {/* ─── Add / Edit Modal ─────────────────────────────────────────────────── */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock size={18} className="text-amber-600" />
                  <span>{editingItem ? 'Edit Pending Book Entry' : 'Add New Pending Book (पेंडिंग किताब दर्ज करें)'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Jo kitabein abhi print me hain ya jinka stock aane wala hai
                </p>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Book Code / Barcode *
                  </label>
                  <input
                    type="text"
                    value={formBookCode}
                    onChange={(e) => setFormBookCode(e.target.value.toUpperCase())}
                    placeholder="e.g. FRBR1-001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pending Quantity (प्रतियां) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                    placeholder="50"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-amber-800 focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Book Name / Title *
                </label>
                <input
                  type="text"
                  value={formBookName}
                  onChange={(e) => setFormBookName(e.target.value)}
                  placeholder="e.g. FR Brahmastra Vol 1"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Printer / Vendor (वेंडर/प्रिंटर)
                  </label>
                  <input
                    type="text"
                    value={formPrinter}
                    onChange={(e) => setFormPrinter(e.target.value)}
                    placeholder="e.g. Sunrise Printers"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expected Arrival Date
                  </label>
                  <input
                    type="date"
                    value={formExpectedDate}
                    onChange={(e) => setFormExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Priority (प्राथमिकता)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['NORMAL', 'HIGH', 'URGENT'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormPriority(p)}
                      className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        formPriority === p
                          ? p === 'URGENT'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                            : p === 'HIGH'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-slate-800 text-white border-slate-800 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Remarks / Notes (टिप्पणी)
                </label>
                <input
                  type="text"
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  placeholder="e.g. 500 copies reprint order placed"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting}
                  onClick={() => setIsFormModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
                >
                  {isSubmitting ? <LoadingSpinner /> : editingItem ? 'Save Changes' : 'Confirm & Add Entry'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Receive Stock Modal ──────────────────────────────────────────────── */}
      {receiveItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-emerald-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <PackageCheck size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Receive into Warehouse Stock</h3>
                <p className="text-xs text-slate-500">
                  Yeh kitabein Available Stock master me live jud jayengi
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Book Code:</span>
                <span className="font-mono font-bold text-slate-800">{receiveItem.bookCode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Book Name:</span>
                <span className="font-bold text-slate-900 text-right truncate max-w-[220px]">
                  {receiveItem.bookName}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-600 font-semibold">Total Pending:</span>
                <span className="font-black text-amber-700">{receiveItem.pendingQuantity} copies</span>
              </div>
            </div>

            <form onSubmit={handleReceiveSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  How many copies arrived? (कितनी प्रतियां वेयरहाउस में आ गईं?) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={receiveItem.pendingQuantity}
                  value={receiveQty}
                  onChange={(e) => setReceiveQty(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-emerald-400 rounded-lg text-base font-black text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Inward Remarks (चालान / नोट)
                </label>
                <input
                  type="text"
                  value={receiveRemarks}
                  onChange={(e) => setReceiveRemarks(e.target.value)}
                  placeholder={`Arrival from ${receiveItem.printerOrVendor || 'Printer'}`}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isReceiving}
                  onClick={() => setReceiveItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isReceiving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  {isReceiving ? <LoadingSpinner /> : 'Confirm & Add to Stock'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ────────────────────────────────────────── */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Pending Record?</h3>
                <p className="text-xs text-rose-600">
                  Yeh pending entry permanently delete ho jayegi
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Kya aap sach me <strong className="text-slate-900">"{deleteItem.bookName}" ({deleteItem.bookCode})</strong> ka pending record delete karna chahte hain?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="secondary"
                disabled={isDeleting}
                onClick={() => setDeleteItem(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteSubmit}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
              >
                {isDeleting ? <LoadingSpinner /> : 'Yes, Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PendingStockPage;
