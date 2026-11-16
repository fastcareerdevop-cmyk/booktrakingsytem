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

  // Overall Statistics
  const stats = useMemo(() => {
    let totalWeightKg = 0;
    let totalItems = 0;
    const courierCounts: Record<string, number> = {};

    filteredOrders.forEach((o) => {
      const cName = o.courierName || 'Unassigned';
      courierCounts[cName] = (courierCounts[cName] || 0) + 1;

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

  // Group filtered orders by Courier Name (Trackon, India Post, DTDC, etc.)
  const courierGroups = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    filteredOrders.forEach((order) => {
      const courier = (order.courierName || 'Unassigned').trim();
      if (!groups[courier]) groups[courier] = [];
      groups[courier].push(order);
    });

    // Preferred standard courier order: Trackon -> India Post -> DTDC -> Delhivery -> Others
    const preferredOrder = ['Trackon', 'India Post', 'DTDC', 'Delhivery'];
    const keys = Object.keys(groups).sort((a, b) => {
      const idxA = preferredOrder.findIndex((p) => p.toLowerCase() === a.toLowerCase());
      const idxB = preferredOrder.findIndex((p) => p.toLowerCase() === b.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return keys.map((courierName) => {
      const groupOrders = groups[courierName];
      let groupWeightKg = 0;
      groupOrders.forEach((o) => {
        if (o.weight) {
          const num = parseFloat(String(o.weight).replace(/[^0-9.]/g, ''));
          if (!isNaN(num)) groupWeightKg += num;
        }
      });

      return {
        courierName,
        orders: groupOrders,
        totalParcels: groupOrders.length,
        totalWeightKg: groupWeightKg > 0 ? groupWeightKg.toFixed(3) : null,
      };
    });
  }, [filteredOrders]);

  // Export to Excel (.xlsx) - Grouped by Courier in 2 Parts Side-by-Side with Signatures
  const handleExportExcel = () => {
    if (courierGroups.length === 0 || filteredOrders.length === 0) {
      alert('No dispatch orders available to export.');
      return;
    }

    const manifestDate = selectedDate || new Date().toISOString().slice(0, 10);
    const sheetRows: any[] = [];

    // Main Title Header
    sheetRows.push({ '# (1)': 'FAST (FIRST ATTEMPT SUCCESS TUTORIALS) - DISPATCH MANIFEST' });
    sheetRows.push({
      '# (1)': `Date: ${manifestDate} | Total Parcels: ${filteredOrders.length} | Total Weight: ${stats.totalWeightKg ? stats.totalWeightKg + ' KG' : 'N/A'}`
    });
    sheetRows.push({});

    courierGroups.forEach((group) => {
      sheetRows.push({
        '# (1)': `=== COURIER: ${group.courierName.toUpperCase()} (${group.totalParcels} Parcels${group.totalWeightKg ? ` | ${group.totalWeightKg} KG` : ''}) ===`
      });

      const half = Math.ceil(group.orders.length / 2);
      const leftOrders = group.orders.slice(0, half);
      const rightOrders = group.orders.slice(half);

      sheetRows.push({
        '# (1)': '#',
        'Student Name (1)': 'Student Name',
        'Weight (1)': 'Weight',
        'Tracking ID (1)': 'Tracking ID (AWB)',
        '|': '|',
        '# (2)': '#',
        'Student Name (2)': 'Student Name',
        'Weight (2)': 'Weight',
        'Tracking ID (2)': 'Tracking ID (AWB)',
      });

      for (let r = 0; r < half; r++) {
        const leftO = leftOrders[r];
        const rightO = rightOrders[r];
        sheetRows.push({
          '# (1)': r + 1,
          'Student Name (1)': leftO ? (leftO.studentName || '-') : '',
          'Weight (1)': leftO ? (leftO.weight ? String(leftO.weight).trim() : '-') : '',
          'Tracking ID (1)': leftO ? (leftO.trackingId || '-') : '',
          '|': '|',
          '# (2)': rightO ? (half + r + 1) : '',
          'Student Name (2)': rightO ? (rightO.studentName || '-') : '',
          'Weight (2)': rightO ? (rightO.weight ? String(rightO.weight).trim() : '-') : '',
          'Tracking ID (2)': rightO ? (rightO.trackingId || '-') : '',
        });
      }

      // Signature block for this courier
      sheetRows.push({});
      sheetRows.push({
        '# (1)': '2. DISPATCHED / HANDED OVER BY',
        'Student Name (1)': 'Signature: __________________________',
        '|': '',
        '# (2)': '3. RECEIVED BY COURIER PERSON',
        'Student Name (2)': 'Signature & Stamp: __________________',
      });
      sheetRows.push({});
      sheetRows.push({});
    });

    const worksheet = XLSX.utils.json_to_sheet(sheetRows, { skipHeader: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dispatch Manifest');

    const fileName = `Dispatch_Report_${manifestDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Print Manifest (Clean A4 Letterhead, 2 Parts Side-by-Side to eliminate blank space, 2 Signatures per Courier)
  const handlePrintManifest = () => {
    if (courierGroups.length === 0 || filteredOrders.length === 0) {
      alert('No dispatch orders available to print.');
      return;
    }

    const manifestDate = selectedDate || new Date().toISOString().slice(0, 10);

    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) {
      alert('Popup blocker prevented printing. Please allow popups for this site.');
      return;
    }

    const courierSectionsHtml = courierGroups
      .map((group) => {
        const half = Math.ceil(group.orders.length / 2);
        const leftOrders = group.orders.slice(0, half);
        const rightOrders = group.orders.slice(half);

        const renderRows = (orderList: any[], startIndex: number) =>
          orderList
            .map((o, i) => `
              <tr>
                <td style="text-align: center; font-weight: bold; width: 32px; padding: 5px 4px;">${startIndex + i + 1}</td>
                <td style="font-weight: 700; color: #0f172a; padding: 5px 6px; font-size: 11px;">${escapeHtml(o.studentName || '-')}</td>
                <td style="text-align: center; font-weight: 600; width: 55px; padding: 5px 4px;">${escapeHtml(o.weight || '-')}</td>
                <td style="font-family: monospace; font-weight: bold; text-align: center; width: 135px; padding: 5px 6px; font-size: 11px;">${escapeHtml(o.trackingId || '-')}</td>
              </tr>
            `)
            .join('');

        const leftRowsHtml = renderRows(leftOrders, 0);
        const rightRowsHtml = renderRows(rightOrders, half);

        return `
          <div class="courier-section">
            <div class="courier-banner">
              <span class="courier-title">🚚 COURIER: ${escapeHtml(group.courierName.toUpperCase())}</span>
              <span class="courier-meta">${group.totalParcels} Parcels ${group.totalWeightKg ? `| Total Weight: ${group.totalWeightKg} KG` : ''}</span>
            </div>

            <!-- Dual Side-by-Side Tables -->
            <div class="dual-tables-grid">
              
              <!-- Part 1 (Left Column) -->
              <div class="dual-col">
                <table class="manifest-table">
                  <thead>
                    <tr>
                      <th style="width: 32px; text-align: center;">#</th>
                      <th>STUDENT NAME</th>
                      <th style="width: 55px; text-align: center;">WT</th>
                      <th style="width: 135px; text-align: center;">TRACKING ID (AWB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${leftRowsHtml}
                  </tbody>
                </table>
              </div>

              <!-- Part 2 (Right Column) -->
              ${rightOrders.length > 0 ? `
                <div class="dual-col">
                  <table class="manifest-table">
                    <thead>
                      <tr>
                        <th style="width: 32px; text-align: center;">#</th>
                        <th>STUDENT NAME</th>
                        <th style="width: 55px; text-align: center;">WT</th>
                        <th style="width: 135px; text-align: center;">TRACKING ID (AWB)</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rightRowsHtml}
                    </tbody>
                  </table>
                </div>
              ` : ''}

            </div>

            <!-- 2-Party Signature Box for this Courier -->
            <div class="signatures-box">
              <div class="sig-col">
                <div class="sig-role">2. DISPATCHED / HANDED OVER BY</div>
                <div class="sig-line">Signature: __________________________</div>
              </div>
              <div class="sig-col">
                <div class="sig-role">3. RECEIVED BY COURIER PERSON</div>
                <div class="sig-line">Signature &amp; Stamp: __________________</div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dispatch Manifest - ${manifestDate}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 8mm 10mm 8mm;
          }
          * {
            box-sizing: border-box;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
          }
          body {
            margin: 0;
            padding: 12px;
            color: #1e293b;
            background: #fff;
            font-size: 11px;
          }
          .header-table {
            width: 100%;
            border-bottom: 2.5px solid #dc2626;
            padding-bottom: 6px;
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
            font-size: 10.5px;
            font-weight: 600;
            color: #64748b;
          }
          .doc-title {
            font-size: 15px;
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
            font-size: 10.5px;
            font-weight: 700;
            margin-top: 3px;
          }
          .courier-section {
            margin-bottom: 20px;
            page-break-inside: avoid;
          }
          .courier-banner {
            background: #0f172a;
            color: #fff;
            padding: 5px 10px;
            border-radius: 4px 4px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .courier-title {
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.5px;
          }
          .courier-meta {
            font-size: 10.5px;
            font-weight: 600;
            color: #cbd5e1;
          }
          .dual-tables-grid {
            display: flex;
            gap: 8px;
            align-items: flex-start;
            width: 100%;
          }
          .dual-col {
            flex: 1;
            min-width: 0;
          }
          .manifest-table {
            width: 100%;
            border-collapse: collapse;
          }
          .manifest-table th {
            background: #f8fafc;
            color: #334155;
            font-weight: 700;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: 1px solid #cbd5e1;
            padding: 5px 6px;
          }
          .manifest-table td {
            border: 1px solid #cbd5e1;
            padding: 4px 6px;
            font-size: 10.5px;
            vertical-align: middle;
          }
          .manifest-table tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .signatures-box {
            margin-top: 10px;
            border: 1.5px solid #cbd5e1;
            border-radius: 4px;
            padding: 10px 14px;
            background: #fafafa;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
          }
          .sig-col {
            width: 48%;
          }
          .sig-role {
            font-weight: 800;
            font-size: 10.5px;
            color: #0f172a;
            text-transform: uppercase;
            margin-bottom: 10px;
          }
          .sig-line {
            font-size: 10.5px;
            font-weight: 600;
            color: #334155;
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
                  Total Parcels: <strong>${filteredOrders.length}</strong>
                  ${stats.totalWeightKg ? `&nbsp;|&nbsp; Total Weight: <strong>${stats.totalWeightKg} KG</strong>` : ''}
                </div>
              </td>
            </tr>
          </table>
        </div>

        ${courierSectionsHtml}

        <div style="margin-top: 14px; font-size: 9px; color: #94a3b8; text-align: center;">
          Manifest Generated by FAST Book Tracking System on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
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
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-red-600 to-rose-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                Courier Dispatch Report & Manifest (डिस्पैच रिपोर्ट)
              </h2>
              <p className="text-xs text-red-100 font-medium">
                2-part side-by-side view to eliminate blank space, grouped by courier with handover signatures
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
                <option value="Trackon">Trackon</option>
                <option value="India Post">India Post</option>
                <option value="DTDC">DTDC</option>
                <option value="Delhivery">Delhivery</option>
              </select>
            </div>

            {/* 3. Search Filter */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student, tracking ID..."
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

        {/* Table Content Area: Courier-wise Flow in 2 Parts Side-by-Side */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-red-600" />
              <p className="text-sm font-semibold">Loading dispatch report data...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-medium">
              {error}
            </div>
          ) : courierGroups.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Package className="w-12 h-12 mx-auto stroke-1 mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600">No orders found matching the selected Date & Courier filters.</p>
              <p className="text-xs text-slate-400 mt-1">Try changing the date or courier filter to view earlier orders.</p>
            </div>
          ) : (
            courierGroups.map((group) => {
              const half = Math.ceil(group.orders.length / 2);
              const leftOrders = group.orders.slice(0, half);
              const rightOrders = group.orders.slice(half);

              return (
                <div key={group.courierName} className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                  
                  {/* Courier Header Bar */}
                  <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-red-400" />
                      <span className="font-bold text-sm tracking-wide uppercase">
                        Courier: {group.courierName}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 font-semibold">
                      <span>{group.totalParcels} Parcels</span>
                      {group.totalWeightKg && (
                        <span className="ml-2 pl-2 border-l border-slate-700">
                          Total Weight: {group.totalWeightKg} KG
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 2-Part Side-by-Side Tables to eliminate blank space */}
                  <div className="p-3 bg-slate-50/50">
                    <div className={`grid gap-3 items-start ${rightOrders.length > 0 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                      
                      {/* Part 1 (Left Table) */}
                      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10.5px] border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-2.5 w-10 text-center">#</th>
                              <th className="py-2.5 px-3">Student Name</th>
                              <th className="py-2.5 px-2.5 text-center w-20">Weight</th>
                              <th className="py-2.5 px-3 text-center w-36">Tracking ID (AWB)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {leftOrders.map((order, idx) => (
                              <tr key={order.id || idx} className="hover:bg-slate-50 transition-colors">
                                <td className="py-2 px-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                                <td className="py-2 px-3 font-bold text-slate-900 truncate max-w-[180px]" title={order.studentName}>
                                  {order.studentName}
                                </td>
                                <td className="py-2 px-2.5 text-center font-semibold text-slate-800">
                                  {order.weight ? (
                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                      {order.weight}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-slate-900 text-center text-[11px]">
                                  {order.trackingId || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Part 2 (Right Table) */}
                      {rightOrders.length > 0 && (
                        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10.5px] border-b border-slate-200">
                              <tr>
                                <th className="py-2.5 px-2.5 w-10 text-center">#</th>
                                <th className="py-2.5 px-3">Student Name</th>
                                <th className="py-2.5 px-2.5 text-center w-20">Weight</th>
                                <th className="py-2.5 px-3 text-center w-36">Tracking ID (AWB)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150">
                              {rightOrders.map((order, idx) => (
                                <tr key={order.id || idx} className="hover:bg-slate-50 transition-colors">
                                  <td className="py-2 px-2.5 text-center font-bold text-slate-500">{half + idx + 1}</td>
                                  <td className="py-2 px-3 font-bold text-slate-900 truncate max-w-[180px]" title={order.studentName}>
                                    {order.studentName}
                                  </td>
                                  <td className="py-2 px-2.5 text-center font-semibold text-slate-800">
                                    {order.weight ? (
                                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                        {order.weight}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 font-mono font-bold text-slate-900 text-center text-[11px]">
                                    {order.trackingId || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                    </div>
                  </div>

                  {/* Dedicated 2 Signatures Block for this Courier */}
                  <div className="p-4 bg-slate-50 border-t border-slate-200">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                      Courier Handover & Verification: {group.courierName}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                        <div className="text-xs font-black text-slate-900 uppercase">
                          2. DISPATCHED / HANDED OVER BY
                        </div>
                        <div className="mt-3 pt-2 border-t border-dashed border-slate-300 text-xs text-slate-500 font-medium">
                          Signature: __________________________
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                        <div className="text-xs font-black text-slate-900 uppercase">
                          3. RECEIVED BY COURIER PERSON
                        </div>
                        <div className="mt-3 pt-2 border-t border-dashed border-slate-300 text-xs text-slate-500 font-medium">
                          Signature & Stamp: __________________
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>2-part layout utilizes full page width without empty gaps and saves 50% paper on print.</span>
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
              <span>Print Manifest</span>
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
