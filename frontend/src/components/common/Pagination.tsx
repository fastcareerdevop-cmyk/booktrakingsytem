import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal } from 'lucide-react';
import { Button } from './Button';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalRecords?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (newSize: number) => void;
  pageSizeOptions?: number[]; // default [10, 25, 50, 100]
  maxCustomLimit?: number; // default 100
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalRecords,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  maxCustomLimit = 100,
  className = '',
}) => {
  // Custom limit input state
  const [customLimit, setCustomLimit] = useState<string>(pageSize.toString());
  const [jumpPage, setJumpPage] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);

  useEffect(() => {
    setCustomLimit(pageSize.toString());
  }, [pageSize]);

  // Don't render if there's completely no data
  if (totalRecords === 0) {
    return null;
  }

  const safeTotalPages = Math.max(1, totalPages || 1);
  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord =
    totalRecords !== undefined ? Math.min(currentPage * pageSize, totalRecords) : currentPage * pageSize;

  const handleApplyCustomLimit = (val?: string) => {
    const raw = parseInt(val || customLimit, 10);
    if (!isNaN(raw) && raw >= 1) {
      const clamped = Math.min(maxCustomLimit, Math.max(1, raw));
      setCustomLimit(clamped.toString());
      if (onPageSizeChange) {
        onPageSizeChange(clamped);
      }
    }
  };

  const handleApplyJump = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPage, 10);
    if (!isNaN(p) && p >= 1 && p <= safeTotalPages) {
      onPageChange(p);
      setJumpPage('');
    }
  };

  return (
    <div
      className={`flex flex-col lg:flex-row items-center justify-between gap-3 pt-3 pb-2 border-t border-slate-200/90 text-xs text-slate-600 bg-white/70 px-3 py-2.5 rounded-xl shadow-2xs ${className}`}
    >
      {/* ─── LEFT: Record counts ─── */}
      <div className="flex items-center gap-2 text-slate-600">
        {totalRecords !== undefined ? (
          <span>
            Showing <strong className="text-slate-900 font-bold">{startRecord}</strong> to{' '}
            <strong className="text-slate-900 font-bold">{endRecord}</strong> of{' '}
            <strong className="text-[#DE3744] font-black">{totalRecords}</strong> results
          </span>
        ) : (
          <span>
            Page <strong className="text-slate-900 font-bold">{currentPage}</strong> of{' '}
            <strong className="text-slate-900 font-bold">{safeTotalPages}</strong>
          </span>
        )}
      </div>

      {/* ─── MIDDLE: Customize limit up to 100 ─── */}
      {onPageSizeChange && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200/90 px-3 py-1.5 rounded-lg shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#DE3744]" />
            Rows:
          </span>

          {/* Quick select presets (10, 25, 50, 100) */}
          <div className="flex items-center gap-1">
            {pageSizeOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setCustomLimit(opt.toString());
                  setShowCustomInput(false);
                  onPageSizeChange(opt);
                }}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer ${
                  pageSize === opt && !showCustomInput
                    ? 'bg-[#DE3744] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-slate-200 mx-0.5" />

          {/* Custom Input box (1 to max 100) */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-500">Custom (1-{maxCustomLimit}):</span>
            <input
              type="number"
              min="1"
              max={maxCustomLimit}
              value={customLimit}
              onChange={(e) => {
                setCustomLimit(e.target.value);
                setShowCustomInput(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyCustomLimit();
                }
              }}
              className="w-14 px-1.5 py-0.5 text-center font-mono font-bold text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
              placeholder="100"
              title={`Enter any number between 1 and ${maxCustomLimit}`}
            />
            <button
              type="button"
              onClick={() => handleApplyCustomLimit()}
              className="px-2 py-0.5 bg-slate-700 hover:bg-slate-900 text-white rounded text-[11px] font-bold cursor-pointer transition-colors"
              title="Apply custom rows limit"
            >
              Set
            </button>
          </div>
        </div>
      )}

      {/* ─── RIGHT: Page Navigation & Direct Jump ─── */}
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        {/* First Page */}
        {safeTotalPages > 2 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
            icon={<ChevronsLeft className="w-3.5 h-3.5" />}
            className="px-2 py-1 h-7 text-xs"
            title="First Page"
          />
        )}

        {/* Previous */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          icon={<ChevronLeft className="w-3.5 h-3.5" />}
          className="px-2.5 py-1 h-7 text-xs font-semibold"
        >
          Previous
        </Button>

        {/* Page indicator pill */}
        <div className="px-2.5 py-1 text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded-md">
          {currentPage} / {safeTotalPages}
        </div>

        {/* Next */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= safeTotalPages}
          icon={<ChevronRight className="w-3.5 h-3.5" />}
          className="px-2.5 py-1 h-7 text-xs font-semibold"
        >
          Next
        </Button>

        {/* Last Page */}
        {safeTotalPages > 2 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(safeTotalPages)}
            disabled={currentPage >= safeTotalPages}
            icon={<ChevronsRight className="w-3.5 h-3.5" />}
            className="px-2 py-1 h-7 text-xs"
            title="Last Page"
          />
        )}

        {/* Jump to page form if > 2 pages */}
        {safeTotalPages > 2 && (
          <form onSubmit={handleApplyJump} className="flex items-center gap-1 ml-1.5">
            <span className="text-[11px] text-slate-500">Go:</span>
            <input
              type="number"
              min="1"
              max={safeTotalPages}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              placeholder="pg"
              className="w-11 px-1 py-0.5 text-center font-mono text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </form>
        )}
      </div>
    </div>
  );
};
