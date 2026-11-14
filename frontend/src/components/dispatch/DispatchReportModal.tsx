import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Printer,
  Calendar,
  Truck,
  Search,
  X,
  Download,
  CheckCircle2,
  Package,
  Weight,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import api from '../../services/api';

interface DispatchReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCourier?: string;
}

export const DispatchReportModal: React.FC<DispatchReportModalProps> = ({
  isOpen,
  onClose,
  initialCourier = 'ALL',
}) => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedCourier, setSelectedCourier] = useState(initialCourier);
  const [filterSearch, setFilterSearch] = useState('');
  const [onlyCompleted, setOnlyCompleted] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch report data whenever modal opens or filters change
  const fetchReportData = async () => {
    if (!isOpen) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/orders/barcode-sheet', {
        params: {
          courier: selectedCourier !== 'ALL' ? selectedCourier : undefined,
          date: selectedDate || undefined,
        },
      });
      const data = res.data?.data || res.data || [];
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to load dispatch report data:', err);
      setError(err.response?.data?.message || 'Failed to load dispatch report data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedCourier(initialCourier);
      fetchReportData();
    }
  }, [isOpen, selectedDate, selectedCourier]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Completed filter
      if (onlyCompleted && o.status && o.status !== 'COMPLETED' && o.dispatchedQuantity === 0) {
        // If items exist, check if all items are dispatched
        const hasDispatched = (o.items || []).some((it: any) => (it.dispatchedQuantity || 0) > 0);
        if (!hasDispatched) return false;
      }

      // Search filter
      if (filterSearch.trim()) {
        const query = filterSearch.toLowerCase().trim();
        const studentMatch = (o.studentName || '').toLowerCase().includes(query);
        const trackingMatch = (o.trackingId || '').toLowerCase().includes(query);
        const cityMatch = (o.city || '').toLowerCase().includes(query);
        const courierMatch = (o.courierName || '').toLowerCase().includes(query);
        const productMatch = (o.productCode || '').toLowerCase().includes(query);
        const bookMatch = (o.items || []).some(
          (it: any) =>
            (it.bookCode || '').toLowerCase().includes(query) ||
            (it.bookName || '').toLowerCase().includes(query)
        );
        if (!studentMatch && !trackingMatch && !cityMatch && !courierMatch && !productMatch && !bookMatch) {
          return false;
        }
      }

      return true;
    });
  }, [orders, onlyCompleted, filterSearch]);

  // Aggregated Stats
  const stats = useMemo(() => {
    let totalWeightKg = 0;
    let totalItems = 0;
    const courierCounts: Record<string, number> = {};

    filteredOrders.forEach((o) => {
      const cName = o.courierName || 'Unassigned';
      courierCounts[cName] = (courierCounts[cName] || 0) + 1;

      // Extract weight number if available (e.g. "0.85 kg" -> 0.85)
      if (o.weight) {
        const num = parseFloat(String(o.weight).replace(/[^0-9.]/g, ''));
        if (!isNaN(num)) totalWeightKg += num;
      }

      const orderBooksCount = (o.items || []).reduce(
        (sum: number, it: any) => sum + (it.dispatchedQuantity || it.requiredQuantity || 1),
        0
      );
      totalItems += orderBooksCount;
    });

    return {
      totalParcels: filteredOrders.length,
      totalWeightKg: totalWeightKg > 0 ? totalWeightKg.toFixed(2) : null,
      totalItems,
      courierCounts,
    };
  }, [filteredOrders]);

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      alert('No dispatch orders available to export.');
      return;
    }

    const courierLabel = selectedCourier === 'ALL' ? 'All Couriers' : selectedCourier;
    const manifestDate = selectedDate || new Date().toISOString().slice(0, 10);

    const sheetRows: any[] = [];

    // Header info rows
    sheetRows.push({ 'S.No': 'FAST (FIRST ATTEMPT SUCCESS TUTORIALS) - DISPATCH MANIFEST' });
    sheetRows.push({ 'S.No': `Date: ${manifestDate} | Courier: ${courierLabel} | Total Parcels: ${filteredOrders.length} | Total Weight: ${stats.totalWeightKg ? stats.totalWeightKg + ' KG' : 'N/A'}` });
    sheetRows.push({}); // Empty separator row

    // Table rows
    filteredOrders.forEach((o, idx) => {
      const booksSummary = (o.items || [])
        .map((it: any) => `${it.bookCode || it.bookName} (${it.dispatchedQuantity || it.requiredQuantity || 1})`)
        .join(', ');

      sheetRows.push({
        'S.No': idx + 1,
        'Date': manifestDate,
        'Student Name': o.studentName || '-',
        'City / Location': o.city || '-',
        'Weight': o.weight ? String(o.weight).trim() : '-',
        'Courier Name': o.courierName || '-',
        'Tracking ID (AWB)': o.trackingId || '-',
        'Product / Course': o.productCode || (o.products && o.products[0]?.productName) || '-',
        'Books / Items Dispatched': booksSummary || '-',
        'Mobile Number': o.mobileNumber || '-',
        'Full Address': o.address || '-',
      });
    });

    // Signature rows at the bottom
    sheetRows.push({});
    sheetRows.push({});
    sheetRows.push({ 'S.No': '--- PHYSICAL VERIFICATION & COURIER HANDOVER SIGNATURES ---' });
    sheetRows.push({
      'S.No': 'Prepared & Packed By:',
      'Date': '_________________________',
      'Student Name': 'Handed Over By:',
      'City / Location': '_________________________',
      'Weight': 'Courier Receiver Name:',
      'Courier Name': '_________________________',
      'Tracking ID (AWB)': 'Receiver Mobile:',
      'Product / Course': '_________________________',
      'Books / Items Dispatched': 'Receiver Signature:',
      'Mobile Number': '_________________________',
    });

    const worksheet = XLSX.utils.json_to_sheet(sheetRows, { skipHeader: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dispatch Manifest');

    const fileName = `Dispatch_Report_${courierLabel.replace(/\s+/g, '_')}_${manifestDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Print Manifest (Clean A4 Letterhead with Signature Boxes)
  const handlePrintManifest = () => {
    if (filteredOrders.length === 0) {
      alert('No dispatch orders available to print.');
      return;
    }

    const courierLabel = selectedCourier === 'ALL' ? 'All Couriers' : selectedCourier;
    const manifestDate = selectedDate || new Date().toISOString().slice(0, 10);

    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) {
      alert('Popup blocker prevented printing. Please allow popups for this site.');
      return;
    }

    const tableRowsHtml = filteredOrders
      .map((o, idx) => {
        const booksList = (o.items || [])
          .map((it: any) => `${it.bookCode} (x${it.dispatchedQuantity || it.requiredQuantity || 1})`)
          .join(', ');

        return `
          <tr>
            <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
            <td style="text-align: center;">${manifestDate}</td>
            <td style="font-weight: bold; color: #0f172a;">${escapeHtml(o.studentName || '-')}</td>
            <td>${escapeHtml(o.city || '-')}</td>
            <td style="text-align: center; font-weight: 600;">${escapeHtml(o.weight || '-')}</td>
            <td style="text-align: center; font-weight: bold; color: #1e3a8a;">${escapeHtml(o.courierName || '-')}</td>
            <td style="font-family: monospace; font-weight: bold; text-align: center;">${escapeHtml(o.trackingId || '-')}</td>
            <td style="font-size: 11px;">${escapeHtml(booksList || o.productCode || '-')}</td>
          </tr>
        `;
      })
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dispatch Manifest - ${courierLabel} - ${manifestDate}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 8mm 12mm 8mm;
          }
          * {
            box-sizing: border-box;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
          }
          body {
            margin: 0;
            padding: 16px;
            color: #1e293b;
            background: #fff;
            font-size: 12px;
          }
          .header-table {
            width: 100%;
            border-bottom: 2px solid #dc2626;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .brand-title {
            font-size: 22px;
            font-weight: 900;
            color: #dc2626;
            letter-spacing: -0.5px;
            line-height: 1.1;
          }
          .brand-sub {
            font-size: 11px;
            font-weight: 600;
            color: #64748b;
          }
          .doc-title {
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
            text-transform: uppercase;
            text-align: right;
          }
          .meta-pill {
            display: inline-block;
            background: #f1f5f9;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-top: 4px;
          }
          .manifest-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .manifest-table th {
            background: #f8fafc;
            color: #334155;
            font-weight: 700;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: 1px solid #cbd5e1;
            padding: 6px 8px;
          }
          .manifest-table td {
            border: 1px solid #cbd5e1;
            padding: 5px 8px;
            font-size: 11px;
            vertical-align: middle;
          }
          .manifest-table tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .signatures-container {
            margin-top: 24px;
            page-break-inside: avoid;
            border: 1.5px solid #cbd5e1;
            border-radius: 6px;
            padding: 12px 14px;
            background: #fafafa;
          }
          .sig-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-top: 8px;
          }
          .sig-card {
            border-top: 1.5px dashed #94a3b8;
            padding-top: 6px;
          }
          .sig-role {
            font-weight: 800;
            font-size: 11px;
            color: #0f172a;
            text-transform: uppercase;
          }
          .sig-line {
            font-size: 10px;
            color: #64748b;
            margin-top: 4px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header-table">
          <table style="width: 100%;">
            <tr>
              <td>
                <div class="brand-title">F.A.S.T.</div>
                <div class="brand-sub">First Attempt Success Tutorials — Dispatch Warehouse</div>
              </td>
              <td style="text-align: right;">
                <div class="doc-title">Courier Dispatch Manifest</div>
                <div class="meta-pill">
                  Date: <strong>${manifestDate}</strong> &nbsp;|&nbsp;
                  Courier: <strong>${courierLabel}</strong> &nbsp;|&nbsp;
                  Total Parcels: <strong>${filteredOrders.length}</strong>
                  ${stats.totalWeightKg ? `&nbsp;|&nbsp; Total Weight: <strong>${stats.totalWeightKg} KG</strong>` : ''}
                </div>
              </td>
            </tr>
          </table>
        </div>

        <table class="manifest-table">
          <thead>
            <tr>
              <th style="width: 32px;">#</th>
              <th style="width: 75px;">Date</th>
              <th>Student Name</th>
              <th>City / Dest.</th>
              <th style="width: 60px;">Weight</th>
              <th style="width: 85px;">Courier</th>
              <th style="width: 130px;">Tracking ID (AWB)</th>
              <th>Book Items</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <!-- Physical Signatures Section -->
        <div class="signatures-container">
          <div style="font-weight: 800; font-size: 11px; text-transform: uppercase; color: #334155; margin-bottom: 4px;">
            Handover & Physical Verification Signatures:
          </div>
          <div class="sig-grid">
            <div class="sig-card">
              <div class="sig-role">1. Prepared & Packed By</div>
              <div class="sig-line">Staff Name: _______________________</div>
              <div class="sig-line" style="margin-top: 18px;">Signature: __________________________</div>
            </div>
            <div class="sig-card">
              <div class="sig-role">2. Dispatched / Handed Over By</div>
              <div class="sig-line">Staff Name: _______________________</div>
              <div class="sig-line" style="margin-top: 18px;">Signature: __________________________</div>
            </div>
            <div class="sig-card">
              <div class="sig-role">3. Received By Courier Person</div>
              <div class="sig-line">Person Name: _____________________</div>
              <div class="sig-line">Mobile No: _______________________</div>
              <div class="sig-line" style="margin-top: 8px;">Signature & Stamp: __________________</div>
            </div>
          </div>
        </div>

        <div style="margin-top: 10px; font-size: 9px; color: #94a3b8; text-align: center;">
          Manifest Generated by FAST Book Tracking System on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} | Total ${filteredOrders.length} Parcels Listed
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-linear-to-r from-red-600 to-rose-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                Courier Dispatch Report & Manifest (डिस्पैच रिपोर्ट)
              </h2>
              <p className="text-xs text-red-100 font-medium">
                Filter by Date & Courier, preview manifest, download Excel, or Print with Receiver Signature
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            
            {/* 1. Date Picker */}
            <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-300 shadow-2xs">
              <Calendar className="w-4 h-4 text-slate-500" />
              <label htmlFor="report-date-picker" className="text-xs font-bold text-slate-600">Date:</label>
              <input
                id="report-date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs font-semibold text-slate-800 focus:outline-none bg-transparent cursor-pointer"
              />
            </div>

            {/* 2. Courier Dropdown */}
            <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-300 shadow-2xs">
              <Truck className="w-4 h-4 text-slate-500" />
              <label htmlFor="report-courier-select" className="text-xs font-bold text-slate-600">Courier:</label>
              <select
                id="report-courier-select"
                value={selectedCourier}
                onChange={(e) => setSelectedCourier(e.target.value)}
                className="text-xs font-bold text-slate-800 focus:outline-none bg-transparent cursor-pointer pr-1"
              >
                <option value="ALL">All Couriers (सभी कूरियर)</option>
                <option value="DTDC">DTDC</option>
                <option value="Trackon">Trackon</option>
                <option value="India Post">India Post</option>
                <option value="Delhivery">Delhivery</option>
              </select>
            </div>

            {/* 3. Search Filter */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student, tracking, city..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* 4. Only Completed Toggle */}
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyCompleted}
                onChange={(e) => setOnlyCompleted(e.target.checked)}
                className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-slate-300"
              />
              <span>Dispatched Only</span>
            </label>

            {/* Refresh */}
            <button
              onClick={fetchReportData}
              disabled={isLoading}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              title="Refresh Report Data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-red-600' : ''}`} />
            </button>
          </div>

          {/* Action Buttons: Excel and Print */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={isLoading || filteredOrders.length === 0}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="Download manifest in Excel (.xlsx) format"
            >
              <Download className="w-4 h-4" />
              <span>Download Excel</span>
            </button>

            <button
              onClick={handlePrintManifest}
              disabled={isLoading || filteredOrders.length === 0}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="Print physical manifest with signature boxes"
            >
              <Printer className="w-4 h-4" />
              <span>Print Manifest (Sign Sheet)</span>
            </button>
          </div>
        </div>

        {/* Summary Statistics Banner */}
        <div className="px-6 py-2.5 bg-red-50/70 border-b border-red-100 flex flex-wrap items-center justify-between text-xs font-medium text-slate-700 gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5 font-bold text-red-900">
              <Package className="w-4 h-4 text-red-600" />
              Total Orders: <strong className="text-sm font-black">{stats.totalParcels}</strong>
            </span>
            {stats.totalWeightKg && (
              <span className="flex items-center gap-1.5 text-slate-700">
                <Weight className="w-4 h-4 text-slate-500" />
                Total Weight: <strong>{stats.totalWeightKg} KG</strong>
              </span>
            )}
            <span className="flex items-center gap-1.5 text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Total Items: <strong>{stats.totalItems}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(stats.courierCounts).map(([courier, count]) => (
              <span
                key={courier}
                className="bg-white border border-red-200 text-red-800 px-2 py-0.5 rounded-md font-bold text-[11px] shadow-2xs"
              >
                {courier}: {count}
              </span>
            ))}
          </div>
        </div>

        {/* Table Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-red-600" />
              <p className="text-sm font-semibold">Loading dispatch report data...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-medium">
              {error}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Package className="w-12 h-12 mx-auto stroke-1 mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600">No orders found matching the selected Date & Courier filters.</p>
              <p className="text-xs text-slate-400 mt-1">Try changing the date or courier filter to view earlier orders.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-3">City / Location</th>
                    <th className="py-2.5 px-3 text-center">Weight</th>
                    <th className="py-2.5 px-3">Courier</th>
                    <th className="py-2.5 px-3">Tracking ID (AWB)</th>
                    <th className="py-2.5 px-3">Dispatched Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {filteredOrders.map((order, idx) => {
                    const booksDispatched = (order.items || [])
                      .map((it: any) => `${it.bookCode} (${it.dispatchedQuantity || it.requiredQuantity})`)
                      .join(', ');

                    return (
                      <tr key={order.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 text-slate-600 font-medium whitespace-nowrap">{selectedDate}</td>
                        <td className="py-2 px-3 font-bold text-slate-900">{order.studentName}</td>
                        <td className="py-2 px-3 text-slate-700">{order.city || '-'}</td>
                        <td className="py-2 px-3 text-center font-semibold text-slate-800">
                          {order.weight ? (
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                              {order.weight}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px]">
                            {order.courierName || 'Pending'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">
                          {order.trackingId || '-'}
                        </td>
                        <td className="py-2 px-3 text-slate-600 font-medium max-w-xs truncate" title={booksDispatched}>
                          {booksDispatched || order.productCode || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>Printed report contains manual signature blocks for Dispatcher and Courier Receiver.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handlePrintManifest}
              disabled={isLoading || filteredOrders.length === 0}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Report</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
