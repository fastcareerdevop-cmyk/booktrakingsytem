import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { DispatchLog } from '../../types';
import { Card } from '../../components/common/Card';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Badge } from '../../components/common/Badge';
import { Pagination } from '../../components/common/Pagination';
import { EmptyState } from '../../components/common/EmptyState';
import { Button } from '../../components/common/Button';
import { DateFilterSelect } from '../../components/common/DateFilterSelect';
import { FileCheck2, Download, Search } from 'lucide-react';

export const DispatchHistoryPage: React.FC = () => {
  const [logs, setLogs] = useState<DispatchLog[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [bookCode, setBookCode] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogs = async (page = 1, customLimit?: number) => {
    setIsLoading(true);
    try {
      const currentLimit = customLimit || pagination.limit || 10;
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(currentLimit));
      if (bookCode) params.append('bookCode', bookCode);
      if (dateFilter) params.append('dateFilter', dateFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await api.get(`/dispatch/history?${params.toString()}`);
      if (res.data.success) {
        setLogs(res.data.data.logs);
        setPagination(res.data.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load dispatch history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [bookCode, dateFilter, startDate, endDate]);

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      params.append('type', 'dispatches');
      if (bookCode) params.append('bookCode', bookCode);
      if (dateFilter) params.append('dateFilter', dateFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await api.get(`/reports/export?${params.toString()}`, { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Dispatch_Report_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to export dispatches:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dispatch History</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Immutable log of all successful book verification and dispatch events
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={handleExport} icon={<Download className="w-4 h-4" />}>
          Export to Excel
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={bookCode}
              onChange={(e) => setBookCode(e.target.value.toUpperCase())}
              placeholder="Filter by Book Code..."
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600"
            />
          </div>

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
      </Card>

      <Card>
        {isLoading ? (
          <LoadingSpinner message="Loading dispatch history..." />
        ) : logs.length === 0 ? (
          <EmptyState
            title="No dispatches found"
            description="No successful dispatches match your filter criteria."
            icon={<FileCheck2 className="w-6 h-6 text-slate-400" />}
          />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Dispatch Time (IST)</th>
                    <th className="py-3 px-4">Tracking ID</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Book Code & Name</th>
                    <th className="py-3 px-4 text-center">Qty</th>
                    <th className="py-3 px-4">Dispatched By</th>
                    <th className="py-3 px-4 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 text-slate-600 font-mono">
                        {new Date(log.dispatchedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-red-600">
                        {log.orderItem?.order?.trackingId}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {log.orderItem?.order?.studentName}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900 mr-2">{log.verifiedBookCode}</span>
                        <span className="text-slate-500 text-xs">{log.orderItem?.bookName}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">{log.quantity}</td>
                      <td className="py-3 px-4 text-slate-700 font-medium">{log.employee?.name || 'Employee'}</td>
                      <td className="py-3 px-4 text-right">
                        <Badge variant="green">{log.result}</Badge>
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
              onPageChange={(p) => fetchLogs(p)}
              onPageSizeChange={(newLimit) => {
                setPagination(prev => ({ ...prev, limit: newLimit }));
                fetchLogs(1, newLimit);
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
