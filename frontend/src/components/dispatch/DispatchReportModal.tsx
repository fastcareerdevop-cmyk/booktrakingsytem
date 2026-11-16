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

// Helper to determine normalized courier name from explicit field or tracking number pattern
export const getResolvedCourier = (order: any): string => {
  const c = (order.courierName || '').trim();
  if (c) {
    const lower = c.toLowerCase();
    if (lower.includes('trackon') || lower.includes('track on')) return 'Trackon';
    if (lower.includes('india post') || lower.includes('indiapost') || lower.includes('speed post') || lower === 'post') return 'India Post';
    if (lower.includes('dtdc')) return 'DTDC';
    if (lower.includes('delhivery')) return 'Delhivery';
    return c;
  }
  const track = (order.trackingId || '').trim().toUpperCase();
  if (/^50\d+/.test(track)) return 'Trackon';
  if (/IN$/.test(track)) return 'India Post';
  if (/^[DZBK]\d+/i.test(track) || /^D\d+/i.test(track)) return 'DTDC';
  return 'DTDC';
};

export const DispatchReportModal: React.FC<DispatchReportModalProps> = ({
  isOpen,
  onClose,
  initialCourier = 'ALL',
}) => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedCourier, setSelectedCourier] = useState(initialCourier || 'ALL');
  const [filterSearch, setFilterSearch] = useState('');
  const [onlyCompleted, setOnlyCompleted] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasOpenRef = React.useRef(false);

  // Fetch report data for the selected date
  const fetchReportData = async () => {
    if (!isOpen) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/orders/barcode-sheet', {
        params: {
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

  // Sync initialCourier and fetch data only when modal transitions from closed to open
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setSelectedCourier(initialCourier || 'ALL');
      fetchReportData();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialCourier]);

  // Re-fetch data if date changes while modal is open
  useEffect(() => {
    if (isOpen && wasOpenRef.current) {
      fetchReportData();
    }
  }, [selectedDate]);

  // Available couriers detected from loaded orders
  const availableCouriers = useMemo(() => {
    const set = new Set<string>(['Trackon', 'DTDC', 'India Post', 'Delhivery']);
    orders.forEach((o) => {
      const c = getResolvedCourier(o);
      if (c && c !== 'Unassigned') set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  // Filtered orders list (matches courier, status, and search)
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Courier filter
      if (selectedCourier !== 'ALL') {
        const resolved = getResolvedCourier(o).toUpperCase();
        const target = selectedCourier.toUpperCase();
        if (resolved !== target) return false;
      }

      // 2. Completed / Dispatched filter
      if (onlyCompleted && o.status && o.status !== 'COMPLETED' && o.dispatchedQuantity === 0) {
        const hasDispatched = (o.items || []).some((it: any) => (it.dispatchedQuantity || 0) > 0);
        if (!hasDispatched) return false;
      }

      // 3. Search filter
      if (filterSearch.trim()) {
        const query = filterSearch.toLowerCase().trim();
        const studentMatch = (o.studentName || '').toLowerCase().includes(query);
        const trackingMatch = (o.trackingId || '').toLowerCase().includes(query);
        const cityMatch = (o.city || '').toLowerCase().includes(query);
        const courierMatch = (o.courierName || getResolvedCourier(o)).toLowerCase().includes(query);
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
  }, [orders, onlyCompleted, filterSearch, selectedCourier]);

  // Courier counts across all loaded orders for that date (for top badge filters)
  const allCourierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      if (onlyCompleted && o.status && o.status !== 'COMPLETED' && o.dispatchedQuantity === 0) {
        const hasDispatched = (o.items || []).some((it: any) => (it.dispatchedQuantity || 0) > 0);
        if (!hasDispatched) return;
      }
      const c = getResolvedCourier(o);
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }, [orders, onlyCompleted]);

  // Overall Statistics for currently filtered view
  const stats = useMemo(() => {
    let totalWeightKg = 0;
    let totalItems = 0;
    const courierCounts: Record<string, number> = {};

    filteredOrders.forEach((o) => {
      const cName = getResolvedCourier(o);
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
      const courier = getResolvedCourier(order);
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

    const courierSuffix = selectedCourier !== 'ALL' ? `_${selectedCourier.replace(/\s+/g, '_')}` : '';
    const fileName = `Dispatch_Report_${manifestDate}${courierSuffix}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Print Manifest (Clean Native 8-Column Table: Zero blank space on Page 1, instant pagination across A4)
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

        const rowsHtml = Array.from({ length: half })
          .map((_, r) => {
            const leftO = leftOrders[r];
            const rightO = rightOrders[r];

            return `
              <tr>
                <td style="text-align: center; font-weight: bold; width: 28px; padding: 4px 2px;">${r + 1}</td>
                <td style="font-weight: 700; color: #0f172a; padding: 4px 5px; font-size: 10.5px;">${escapeHtml(leftO ? leftO.studentName || '-' : '')}</td>
                <td style="text-align: center; font-weight: 600; width: 48px; padding: 4px 2px;">${escapeHtml(leftO ? leftO.weight || '-' : '')}</td>
                <td style="font-family: monospace; font-weight: bold; text-align: center; width: 125px; padding: 4px 4px; font-size: 10.5px; border-right: 2px solid #94a3b8;">${escapeHtml(leftO ? leftO.trackingId || '-' : '')}</td>
                ${
                  rightO
                    ? `
                  <td style="text-align: center; font-weight: bold; width: 28px; padding: 4px 2px;">${half + r + 1}</td>
                  <td style="font-weight: 700; color: #0f172a; padding: 4px 5px; font-size: 10.5px;">${escapeHtml(rightO.studentName || '-')}</td>
                  <td style="text-align: center; font-weight: 600; width: 48px; padding: 4px 2px;">${escapeHtml(rightO.weight || '-')}</td>
                  <td style="font-family: monospace; font-weight: bold; text-align: center; width: 125px; padding: 4px 4px; font-size: 10.5px;">${escapeHtml(rightO.trackingId || '-')}</td>
                `
                    : `
                  <td style="width: 28px;"></td>
                  <td></td>
                  <td style="width: 48px;"></td>
                  <td style="width: 125px;"></td>
                `
                }
              </tr>
            `;
          })
          .join('');

        return `
          <div class="courier-section">
            <div class="courier-banner">
              <span class="courier-title">🚚 COURIER: ${escapeHtml(group.courierName.toUpperCase())}</span>
              <span class="courier-meta">${group.totalParcels} Parcels ${group.totalWeightKg ? `| Total Weight: ${group.totalWeightKg} KG` : ''}</span>
            </div>

            <table class="manifest-table">
              <thead>
                <tr>
                  <th style="width: 28px; text-align: center;">#</th>
                  <th>STUDENT NAME</th>
                  <th style="width: 48px; text-align: center;">WT</th>
                  <th style="width: 125px; text-align: center; border-right: 2px solid #94a3b8;">TRACKING ID</th>
                  <th style="width: 28px; text-align: center;">#</th>
                  <th>STUDENT NAME</th>
                  <th style="width: 48px; text-align: center;">WT</th>
                  <th style="width: 125px; text-align: center;">TRACKING ID</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>

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
            margin: 6mm 6mm 8mm 6mm;
          }
          * {
            box-sizing: border-box;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
          }
          body {
            margin: 0;
            padding: 8px 10px;
            color: #1e293b;
            background: #fff;
            font-size: 11px;
          }
          .header-table {
            width: 100%;
            border-bottom: 2.5px solid #dc2626;
            padding-bottom: 4px;
            margin-bottom: 8px;
          }
          .brand-title {
            font-size: 20px;
            font-weight: 900;
            color: #dc2626;
            letter-spacing: -0.5px;
            line-height: 1.1;
          }
          .brand-sub {
            font-size: 10px;
            font-weight: 600;
            color: #64748b;
          }
          .doc-title {
            font-size: 14px;
            font-weight: 800;
            color: #0f172a;
            text-transform: uppercase;
            text-align: right;
          }
          .meta-pill {
            display: inline-block;
            background: #f1f5f9;
            padding: 2px 7px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            margin-top: 2px;
          }
          .courier-section {
            margin-bottom: 16px;
          }
          .courier-banner {
            background: #0f172a;
            color: #fff;
            padding: 4px 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            page-break-after: avoid;
          }
          .courier-title {
            font-size: 11.5px;
            font-weight: 800;
            letter-spacing: 0.5px;
          }
          .courier-meta {
            font-size: 10px;
            font-weight: 600;
            color: #cbd5e1;
          }
          .manifest-table {
            width: 100%;
            border-collapse: collapse;
          }
          .manifest-table thead {
            display: table-header-group;
          }
          .manifest-table tr {
            page-break-inside: avoid;
          }
          .manifest-table th {
            background: #f1f5f9;
            color: #1e293b;
            font-weight: 800;
            font-size: 9.5px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            border: 1px solid #cbd5e1;
            padding: 4px 4px;
          }
          .manifest-table td {
            border: 1px solid #cbd5e1;
            padding: 3.5px 4px;
            font-size: 10px;
            vertical-align: middle;
          }
          .manifest-table tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .signatures-box {
            margin-top: 10px;
            border: 1.5px solid #cbd5e1;
            border-radius: 4px;
            padding: 8px 14px;
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
            font-size: 10px;
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
                  ${selectedCourier !== 'ALL' ? `Courier: <strong>${escapeHtml(selectedCourier)}</strong> &nbsp;|&nbsp; ` : ''}
                  Total Parcels: <strong>${filteredOrders.length}</strong>
                  ${stats.totalWeightKg ? `&nbsp;|&nbsp; Total Weight: <strong>${stats.totalWeightKg} KG</strong>` : ''}
                </div>
              </td>
            </tr>
          </table>
        </div>

        ${courierSectionsHtml}

        <div style="margin-top: 10px; font-size: 9px; color: #94a3b8; text-align: center;">
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
                {availableCouriers.map((c) => (
                  <option key={c} value={c}>
                    {c} {allCourierCounts[c] ? `(${allCourierCounts[c]})` : ''}
                  </option>
                ))}
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

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedCourier('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                selectedCourier === 'ALL'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-white border border-red-200 text-red-800 hover:bg-red-100/60'
              }`}
              title="Show all couriers"
            >
              All: {orders.length}
            </button>
            {Object.entries(allCourierCounts).map(([courier, count]) => (
              <button
                key={courier}
                onClick={() => setSelectedCourier(courier)}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                  selectedCourier.toUpperCase() === courier.toUpperCase()
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white border border-red-200 text-red-800 hover:bg-red-100/60'
                }`}
                title={`Filter only ${courier} orders`}
              >
                {courier}: {count}
              </button>
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

                  {/* 2-Part Side-by-Side Unified Table to eliminate blank space */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-2.5 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">Student Name</th>
                          <th className="py-2.5 px-2 text-center w-20">Weight</th>
                          <th className="py-2.5 px-3 text-center w-36 border-r-2 border-slate-300">Tracking ID (AWB)</th>
                          <th className="py-2.5 px-2.5 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">Student Name</th>
                          <th className="py-2.5 px-2 text-center w-20">Weight</th>
                          <th className="py-2.5 px-3 text-center w-36">Tracking ID (AWB)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {Array.from({ length: half }).map((_, r) => {
                          const leftO = leftOrders[r];
                          const rightO = rightOrders[r];

                          return (
                            <tr key={r} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2 px-2.5 text-center font-bold text-slate-500">{r + 1}</td>
                              <td className="py-2 px-3 font-bold text-slate-900 truncate max-w-[170px]" title={leftO.studentName}>
                                {leftO.studentName}
                              </td>
                              <td className="py-2 px-2 text-center font-semibold text-slate-800">
                                {leftO.weight ? (
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                    {leftO.weight}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-900 text-center text-[11px] border-r-2 border-slate-300">
                                {leftO.trackingId || '-'}
                              </td>

                              {rightO ? (
                                <>
                                  <td className="py-2 px-2.5 text-center font-bold text-slate-500">{half + r + 1}</td>
                                  <td className="py-2 px-3 font-bold text-slate-900 truncate max-w-[170px]" title={rightO.studentName}>
                                    {rightO.studentName}
                                  </td>
                                  <td className="py-2 px-2 text-center font-semibold text-slate-800">
                                    {rightO.weight ? (
                                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                        {rightO.weight}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 font-mono font-bold text-slate-900 text-center text-[11px]">
                                    {rightO.trackingId || '-'}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="py-2 px-2.5"></td>
                                  <td className="py-2 px-3"></td>
                                  <td className="py-2 px-2"></td>
                                  <td className="py-2 px-3"></td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
