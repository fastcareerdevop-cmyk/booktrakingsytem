import React, { useState, useRef } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { LoadingSpinner } from '../common/LoadingSpinner';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Package,
  BookOpen,
  Boxes,
  Info,
  Check,
  RefreshCw,
} from 'lucide-react';

export interface ProductExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ProductExcelUploadModal: React.FC<ProductExcelUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { success, error, warning } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  if (!isOpen) return null;

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        error('Sirf Excel (.xlsx, .xls) ya CSV (.csv) file upload karein');
        return;
      }
      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  // Download sample template
  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      const res = await api.get('/stock/barcode-catalog/product/template', {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Product_Book_Upload_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success('Sample Excel Template downloaded successfully!');
    } catch (err: any) {
      console.error('Failed to download template:', err);
      error('Template download karne me samasya aayi');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // Submit Excel upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      error('Kripya pehle Excel file select karein');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post('/stock/barcode-catalog/product/bulk-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        success(res.data.message || 'Product Excel successfully import ho gaya!');
        setUploadResult(res.data.data);
        onSuccess();
      }
    } catch (err: any) {
      console.error('Excel upload error:', err);
      error(err.response?.data?.message || 'Excel upload failed. Kripya column format check karein.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setUploadResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* ─── Header ────────────────────────────────────────────── */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Upload Products & Books Excel</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                  Bulk Import
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                प्रोडक्ट कोड, प्रोडक्ट नाम और बुक बारकोड एक्सेल से एक साथ इंपोर्ट करें
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* ─── Modal Body ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Rules / Business Logic Information Box */}
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 text-xs text-indigo-950 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-indigo-900">
              <Info size={15} className="text-indigo-600 shrink-0" />
              <span>स्मार्ट इम्पोर्ट नियम (Smart Import Rules):</span>
            </div>
            <ul className="space-y-1.5 text-slate-700 pl-5 list-disc text-[11.5px] leading-relaxed">
              <li>
                <strong>Naya Product:</strong> Agar Product Code pehle se nahi hoga toh naya create hoga.
              </li>
              <li>
                <strong>Purana Product:</strong> Agar pehle se hoga toh purana he rahega aur usme nayi books jud jayengi.
              </li>
              <li>
                <strong>Book Barcode Control:</strong> Naya Book Code sirf tabhi create hoga jab pehle se na ho. Duplicate create nahi hoga.
              </li>
              <li>
                <strong>Stock Update:</strong> Agar Book Code pehle se mojood hai aur Excel me Quantity di gayi hai, toh uska <strong>Stock update</strong> ho jayega. Agar quantity nahi di toh purana stock surakshit rahega.
              </li>
            </ul>
          </div>

          {/* Download Sample Template Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <FileSpreadsheet size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Sample Excel Template Download Karein</p>
                <p className="text-[11px] text-slate-500">
                  Headers: <code>Product Code</code>, <code>Product Name</code>, <code>Book Code</code>, <code>Book Name</code>, <code>Stock Quantity</code>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={isDownloadingTemplate}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
            >
              {isDownloadingTemplate ? <LoadingSpinner /> : <Download size={13} />}
              <span>Download Template (.xlsx)</span>
            </button>
          </div>

          {/* Upload Form */}
          {!uploadResult ? (
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* Drag & Drop Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  selectedFile
                    ? 'border-indigo-500 bg-indigo-50/30'
                    : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/10'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="flex flex-col items-center justify-center gap-2">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    selectedFile ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Upload size={22} />
                  </div>

                  {selectedFile ? (
                    <div>
                      <p className="text-xs font-bold text-indigo-900">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {(selectedFile.size / 1024).toFixed(1)} KB — Click to change file
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Click karein ya apni Excel sheet (.xlsx, .xls) yahan drop karein
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Product Code aur Product Name columns mandatory hain
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isUploading}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel (रद्द करें)
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-md"
                >
                  {isUploading ? (
                    <>
                      <LoadingSpinner />
                      <span>Processing Excel...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      <span>Upload & Process Excel</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Upload Success & Result Summary View */
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  <span>Excel Data Successfully Process Ho Gaya!</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
                    <span className="text-[11px] text-slate-500 block">New Products</span>
                    <strong className="text-lg font-black text-indigo-700">
                      {uploadResult.productsCreated || 0}
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
                    <span className="text-[11px] text-slate-500 block">Existing Products</span>
                    <strong className="text-lg font-black text-slate-700">
                      {uploadResult.productsExisting || 0}
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
                    <span className="text-[11px] text-slate-500 block">New Books Created</span>
                    <strong className="text-lg font-black text-emerald-700">
                      {uploadResult.booksCreated || 0}
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
                    <span className="text-[11px] text-slate-500 block">Books Stock Updated</span>
                    <strong className="text-lg font-black text-amber-700">
                      {uploadResult.booksUpdated || 0}
                    </strong>
                  </div>
                </div>

                {uploadResult.details?.newProducts?.length > 0 && (
                  <div className="text-[11px] text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200">
                    <strong className="text-indigo-900 block mb-1">
                      Naye Products ({uploadResult.details.newProducts.length}):
                    </strong>
                    <div className="flex flex-wrap gap-1">
                      {uploadResult.details.newProducts.slice(0, 15).map((p: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[10px]">
                          {p}
                        </span>
                      ))}
                      {uploadResult.details.newProducts.length > 15 && (
                        <span className="text-slate-400">+{uploadResult.details.newProducts.length - 15} more...</span>
                      )}
                    </div>
                  </div>
                )}

                {uploadResult.details?.updatedBooks?.length > 0 && (
                  <div className="text-[11px] text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200">
                    <strong className="text-amber-900 block mb-1">
                      Stock Updated Books ({uploadResult.details.updatedBooks.length}):
                    </strong>
                    <div className="flex flex-wrap gap-1">
                      {uploadResult.details.updatedBooks.slice(0, 15).map((b: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono text-[10px]">
                          {b}
                        </span>
                      ))}
                      {uploadResult.details.updatedBooks.length > 15 && (
                        <span className="text-slate-400">+{uploadResult.details.updatedBooks.length - 15} more...</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Done button */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setUploadResult(null);
                  }}
                  className="px-3.5 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Upload Another File
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Done (हो गया)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
