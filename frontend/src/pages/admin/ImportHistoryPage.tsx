import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { ImportBatch } from '../../types';
import { Card } from '../../components/common/Card';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Badge } from '../../components/common/Badge';
import { Pagination } from '../../components/common/Pagination';
import { EmptyState } from '../../components/common/EmptyState';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { History, Eye, AlertCircle } from 'lucide-react';

export const ImportHistoryPage: React.FC = () => {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);

  // Selected batch for error details modal
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);

  const fetchBatches = async (page = 1, customLimit?: number) => {
    setIsLoading(true);
    try {
      const currentLimit = customLimit || pagination.limit || 10;
      const res = await api.get(`/imports?page=${page}&limit=${currentLimit}`);
      if (res.data.success) {
        setBatches(res.data.data.batches);
        setPagination(res.data.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load import batches:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches(1);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Import History</h1>
        <p className="text-sm text-slate-500 mt-0.5">Audit log of all Excel and CSV files uploaded by administrators</p>
      </div>

      <Card>
        {isLoading ? (
          <LoadingSpinner message="Loading import history..." />
        ) : batches.length === 0 ? (
          <EmptyState
            title="No imports found"
            description="No Excel batches have been imported into the system yet."
          />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Upload Date (IST)</th>
                    <th className="py-3 px-4">File Name</th>
                    <th className="py-3 px-4">Uploaded By</th>
                    <th className="py-3 px-4">Total Rows</th>
                    <th className="py-3 px-4">Valid / Invalid</th>
                    <th className="py-3 px-4">Orders Created</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {new Date(batch.uploadedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{batch.originalFileName}</td>
                      <td className="py-3 px-4 text-slate-600">{batch.uploadedByUser?.name || 'Admin'}</td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">{batch.totalRows}</td>
                      <td className="py-3 px-4 font-mono">
                        <span className="text-emerald-600 font-bold">{batch.validRows}</span>
                        <span className="text-slate-400"> / </span>
                        <span className={batch.invalidRows > 0 ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                          {batch.invalidRows}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">{batch._count?.orders ?? batch.importedRows}</td>
                      <td className="py-3 px-4">
                        <Badge status={batch.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {batch.invalidRows > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedBatch(batch)}
                            icon={<AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                          >
                            View Errors
                          </Button>
                        )}
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
              onPageChange={(p) => fetchBatches(p)}
              onPageSizeChange={(newLimit) => {
                setPagination(prev => ({ ...prev, limit: newLimit }));
                fetchBatches(1, newLimit);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
              maxCustomLimit={100}
            />
          </div>
        )}
      </Card>

      {/* Error Summary Modal */}
      <Modal
        isOpen={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
        title="Batch Error Summary"
        subtitle={`File: ${selectedBatch?.originalFileName}`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            The following errors were recorded for {selectedBatch?.invalidRows} row(s) during this import:
          </p>

          <div className="max-h-72 overflow-y-auto space-y-2 text-xs font-mono">
            {Array.isArray(selectedBatch?.errorSummary) && selectedBatch!.errorSummary.length > 0 ? (
              selectedBatch!.errorSummary.map((item: any, i: number) => (
                <div key={i} className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                  <div className="font-bold flex items-center justify-between mb-1">
                    <span>Row #{item.rowNumber}</span>
                    <span>Student: {item.studentName || '-'}</span>
                  </div>
                  <div className="text-[11px] text-rose-600">
                    {Array.isArray(item.errors) ? item.errors.join(' | ') : JSON.stringify(item.errors)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400 italic">No detailed error reasons stored for this batch.</p>
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setSelectedBatch(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
