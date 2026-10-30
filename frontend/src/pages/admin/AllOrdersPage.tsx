import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { Order } from '../../types';
import { Card } from '../../components/common/Card';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Badge } from '../../components/common/Badge';
import { Pagination } from '../../components/common/Pagination';
import { EmptyState } from '../../components/common/EmptyState';
import { Button } from '../../components/common/Button';
import { DateFilterSelect } from '../../components/common/DateFilterSelect';
import { useToast } from '../../context/ToastContext';
import { Search, Eye, Filter, Download, Trash2 } from 'lucide-react';

export const AllOrdersPage: React.FC = () => {
  const { success, error } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchOrders = async (page = 1, customLimit?: number) => {
    setIsLoading(true);
    try {
      const currentLimit = customLimit || pagination.limit || 10;
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(currentLimit));
      if (search) params.append('search', search);
      if (status !== 'ALL') params.append('status', status);
      if (dateFilter) params.append('dateFilter', dateFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await api.get(`/orders?${params.toString()}`);
      if (res.data.success) {
        setOrders(res.data.data.orders);
        setPagination(res.data.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAllOrders = async () => {
    if (!window.confirm('⚠️ KYA AAP SURE HAIN? Yeh sabhi uploaded Dispatch Orders aur unki history delete kar dega taaki aap fresh Excel upload kar sakein!')) {
      return;
    }
    try {
      const res = await api.post('/orders/clear-all');
      if (res.data.success) {
        success('Sabhi dispatch orders successfully delete ho gaye hain!');
        fetchOrders(1);
      }
    } catch (err: any) {
      error(err.response?.data?.message || 'Orders delete karne me error aaya');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, status, dateFilter, startDate, endDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">All Student Orders</h1>
          <p className="text-sm text-slate-500 mt-0.5">Comprehensive view of all imported orders and book fulfillment statuses</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClearAllOrders}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            title="Delete all uploaded orders and history"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All Orders (डिलीट करें)</span>
          </button>

          <Link to="/admin/reports">
            <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />}>
              Export Orders Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student, mobile, tracking ID, book code..."
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          {/* Status & Date Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIALLY_DISPATCHED">Partially Dispatched</option>
              <option value="COMPLETED">Completed</option>
            </select>

            <DateFilterSelect
              filter={dateFilter}
              startDate={startDate}
              endDate={endDate}
              onChange={(f, s, e) => {
                setDateFilter(f);
                if (s !== undefined) setStartDate(s);
                if (e !== undefined) setEndDate(e);
              }}
            />
          </div>
        </div>
      </Card>

      {/* Orders Table */}
      <Card>
        {isLoading ? (
          <LoadingSpinner message="Loading orders..." />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders found"
            description="Try adjusting your search criteria or date filter."
          />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Student & Contact</th>
                    <th className="py-3 px-4">Order Code (Tier 1)</th>
                    <th className="py-3 px-4">Product Code (Tier 2)</th>
                    <th className="py-3 px-4">Tracking ID</th>
                    <th className="py-3 px-4">Books Required (Tier 3)</th>
                    <th className="py-3 px-4 text-center">Required</th>
                    <th className="py-3 px-4 text-center">Dispatched</th>
                    <th className="py-3 px-4 text-center">Pending</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{order.studentName}</div>
                        <div className="text-xs text-slate-500 font-mono">{order.mobileNumber}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-300 inline-flex items-center gap-1 shadow-2xs" title="Order Unique Barcode (Tier 1)">
                          🔖 {order.orderCode || 'ORD-GEN'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded border border-purple-300 inline-flex items-center gap-1 shadow-2xs" title="Product Combo Barcode (Tier 2)">
                          📦 {order.productCode || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 text-xs inline-block">
                          {order.trackingId}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {order.items.map((item) => (
                            <span
                              key={item.id}
                              className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                              title={`${item.bookName} (${item.dispatchedQuantity}/${item.requiredQuantity})`}
                            >
                              {item.bookCode} ({item.dispatchedQuantity}/{item.requiredQuantity})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                        {order.totalRequired}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600">
                        {order.totalDispatched}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-amber-600">
                        {order.totalPending}
                      </td>
                      <td className="py-3 px-4">
                        <Badge status={order.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link to={`/admin/orders/${order.id}`}>
                          <Button variant="outline" size="sm" icon={<Eye className="w-3.5 h-3.5" />}>
                            Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              totalRecords={pagination.total}
              pageSize={pagination.limit}
              onPageChange={(p) => fetchOrders(p)}
              onPageSizeChange={(newLimit) => {
                setPagination(prev => ({ ...prev, limit: newLimit }));
                fetchOrders(1, newLimit);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
              maxCustomLimit={100}
            />
          </div>
        )}
      </Card>
    </div>
  );
};
