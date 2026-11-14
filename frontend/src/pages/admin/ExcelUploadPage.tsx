import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  ArrowRight,
  RefreshCw,
  Eye,
  Info,
  Check,
  PackageOpen,
  ArrowRightCircle,
  Trash2,
  ScanLine,
} from 'lucide-react';
import { Order } from '../../types';
import { DispatchBoxModal } from '../../components/dispatch/DispatchBoxModal';

export const ExcelUploadPage: React.FC = () => {
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);

  // Preview Result
  const [previewData, setPreviewData] = useState<{
    fileHash: string;
    originalFileName: string;
    availableSheets?: string[];
    selectedSheetName?: string;
    totalRows: number;
    validRowsCount: number;
    invalidRowsCount: number;
    isDuplicateFile: boolean;
    previousBatch?: any;
    validRows: any[];
    invalidRows: any[];
  } | null>(null);

  // Active step in the wizard
  // 1: Upload, 2: Preview & Validation, 3: Completed Summary
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Confirmation Modal
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<any>(null);
  const [batchOrders, setBatchOrders] = useState<Order[]>([]);
  const [selectedDispatchOrder, setSelectedDispatchOrder] = useState<Order | null>(null);
  const [isDispatchBoxOpen, setIsDispatchBoxOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
    }
  };

  const handleParseAndPreview = async (sheetName?: string) => {
    if (!file) {
      toastError('Please choose an Excel (.xlsx, .xls) or CSV file first.');
      return;
    }

    setIsParsing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const url = sheetName ? `/imports/preview?sheetName=${encodeURIComponent(sheetName)}` : '/imports/preview';
      const res = await api.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        setPreviewData(res.data.data);
        setCurrentStep(2);
        toastSuccess(`Excel sheet loaded: "${res.data.data.selectedSheetName || 'Active Sheet'}"`);
        if (res.data.data.isDuplicateFile) {
          toastWarning('Notice: A file with this exact content was previously uploaded.');
        }
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to parse Excel file.';
      toastError(msg);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSheetChange = (newSheet: string) => {
    handleParseAndPreview(newSheet);
  };

  const handleDownloadInvalidRows = async () => {
    if (!previewData || previewData.invalidRows.length === 0) return;

    setIsDownloadingErrors(true);
    try {
      const res = await api.post(
        '/imports/download-invalid',
        { invalidRows: previewData.invalidRows },
        { responseType: 'blob' }
      );

      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Invalid_Rows_Report_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toastSuccess('Invalid rows report downloaded.');
    } catch (err: any) {
      toastError('Failed to download invalid rows Excel.');
    } finally {
      setIsDownloadingErrors(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData || previewData.validRows.length === 0) {
      toastError('No valid rows available to import.');
      return;
    }

    setIsImporting(true);
    try {
      const res = await api.post('/imports/confirm', {
        originalFileName: previewData.originalFileName,
        fileHash: previewData.fileHash,
        validRows: previewData.validRows,
        invalidRowsSummary: previewData.invalidRows.map((r) => ({
          rowNumber: r.rowNumber,
          studentName: r.studentName,
          trackingId: r.trackingId,
          errors: r.errors,
        })),
      });

      if (res.data.success) {
        const summary = res.data.data;
        setImportSummary(summary);
        setConfirmModalOpen(false);
        setCurrentStep(3);
        const whatsappSummary = summary.whatsappNotifications;
        const emailSummary = summary.emailNotifications;
        toastSuccess(
          `Orders imported. Email accepted ${emailSummary?.accepted || 0} of ${emailSummary?.total || 0}; WhatsApp webhook accepted ${whatsappSummary?.accepted || 0} of ${whatsappSummary?.total || 0}.`
        );

        // Fetch newly created orders for this batch so they display in outgoing sheet view immediately
        try {
          const batchRes = await api.get(`/orders/outgoing?batchId=${summary.batchId}&limit=50`);
          if (batchRes.data.success) {
            setBatchOrders(batchRes.data.data.orders);
          }
        } catch (fetchErr) {
          console.error('Failed to load batch orders:', fetchErr);
        }
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Database import failed.';
      toastError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearAllOrders = async () => {
    if (!window.confirm('⚠️ KYA AAP SURE HAIN? Yeh sabhi uploaded Dispatch Orders ko delete kar dega taaki aap fresh Excel upload kar sakein!')) {
      return;
    }
    try {
      const res = await api.post('/orders/clear-all');
      if (res.data.success) {
        toastSuccess('Sabhi purane dispatch orders successfully delete ho gaye hain! Ab aap nayi sheet upload kar sakti hain.');
        resetWizard();
      }
    } catch (err: any) {
      toastError(err.response?.data?.message || 'Orders delete karne me error aaya');
    }
  };

  const resetWizard = () => {
    setFile(null);
    setPreviewData(null);
    setImportSummary(null);
    setCurrentStep(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Wizard Header Stepper */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Excel Import Wizard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Step-by-step validation, preview, duplicate detection, and transactional database import
          </p>
        </div>

        <button
          type="button"
          onClick={handleClearAllOrders}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto"
          title="Delete previous orders to re-upload clean sheet"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear Previous Orders (गलत शीट डिलीट करें)</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center justify-between text-xs sm:text-sm font-medium text-slate-500">
        <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'text-red-600 font-semibold' : ''}`}>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
              currentStep > 1 ? 'bg-red-600 text-white' : currentStep === 1 ? 'bg-red-100 text-red-700 ring-2 ring-red-600' : 'bg-slate-100'
            }`}
          >
            {currentStep > 1 ? <Check className="w-4 h-4" /> : '1'}
          </div>
          <span>Upload File</span>
        </div>

        <div className="h-px bg-slate-200 flex-1 mx-4" />

        <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'text-red-600 font-semibold' : ''}`}>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
              currentStep > 2 ? 'bg-red-600 text-white' : currentStep === 2 ? 'bg-red-100 text-red-700 ring-2 ring-red-600' : 'bg-slate-100'
            }`}
          >
            {currentStep > 2 ? <Check className="w-4 h-4" /> : '2'}
          </div>
          <span>Validate & Preview</span>
        </div>

        <div className="h-px bg-slate-200 flex-1 mx-4" />

        <div className={`flex items-center gap-2 ${currentStep === 3 ? 'text-emerald-600 font-semibold' : ''}`}>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
              currentStep === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-100'
            }`}
          >
            3
          </div>
          <span>Import Summary</span>
        </div>
      </div>

      {/* STEP 1: Upload */}
      {currentStep === 1 && (
        <Card title="Step 1: Upload Student Orders Excel or CSV" subtitle="Supported formats: .xlsx, .xls, .csv">
          <div className="space-y-6">
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center hover:border-red-500 transition-colors bg-slate-50/50">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
                id="excel-file-upload"
              />
              <label htmlFor="excel-file-upload" className="cursor-pointer flex flex-col items-center">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4 shadow-xs">
                  <FileSpreadsheet className="w-8 h-8" />
                </div>
                <h3 className="text-base font-semibold text-slate-800">
                  {file ? file.name : 'Click to select or drag and drop your Excel file'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Required columns: Student Name, Mobile Number, Tracking ID, Weight, Course / Product Code, Book Code, Quantity
                </p>
                {file && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-red-100/70 text-red-800 rounded-lg text-xs font-mono">
                    <span>Selected: {file.name}</span>
                    <span className="text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
              </label>
            </div>

            {/* Column Guide Card */}
            <div className="p-4 rounded-xl bg-slate-100/80 border border-slate-200 text-xs text-slate-600 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-red-600" /> Supported Excel Sheet Formats
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const csvContent =
                        'data:text/csv;charset=utf-8,Student Name,Mobile Number,Email,Tracking ID,Weight,Book Code,Book Name,Quantity\nRahul Sharma,9876543210,rahul@example.com,TR101,1.5 kg,QB101,Quantitative Bank,2\nRahul Sharma,9876543210,rahul@example.com,TR101,1.5 kg,MCQ201,MCQ Book,1\nPriya Verma,9876543211,priya@example.com,TR102,2.0 kg,QB101,Quantitative Bank,3';
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement('a');
                      link.setAttribute('href', encodedUri);
                      link.setAttribute('download', 'Standard_Book_Dispatch_Template.csv');
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg border border-red-200 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Standard Template (.csv)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const csvContent =
                        'data:text/csv;charset=utf-8,name,phone,product_name,tracking_number,weight,dispatch_date,courier\nRahul Sharma,919584510000,CA Inter IDT Full Book Set 8.0,C1144011340IN,1.8 kg,03-10-2026,India Post\nPriya Patel,918889888034,CA Final Tax Fast Track Book,DT987654321IN,1.2 kg,03-10-2026,DTDC Courier';
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement('a');
                      link.setAttribute('href', encodedUri);
                      link.setAttribute('download', 'FAST_Courier_Dispatch_Template.csv');
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> FAST Template (.csv)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-800">name / Student Name</span>
                  <p className="text-slate-400 text-[10px]">Student / Customer Name</p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-800">phone / Mobile Number</span>
                  <p className="text-slate-400 text-[10px]">10-12 digit phone number</p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-800">tracking_number / ID</span>
                  <p className="text-slate-400 text-[10px]">Courier Tracking / AWB No.</p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-800">product_name / Book Name</span>
                  <p className="text-slate-400 text-[10px]">Book / Course title</p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-800">book_code (Optional)</span>
                  <p className="text-slate-400 text-[10px]">Auto-derived if missing</p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-800">quantity (Optional)</span>
                  <p className="text-slate-400 text-[10px]">Defaults to 1 if missing</p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-800">dispatch_date (Optional)</span>
                  <p className="text-slate-400 text-[10px]">Dispatch date</p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-800">courier (Optional)</span>
                  <p className="text-slate-400 text-[10px]">Courier partner name</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="primary"
                onClick={() => handleParseAndPreview()}
                disabled={!file}
                isLoading={isParsing}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Parse & Validate Data
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 2: Preview & Validation */}
      {currentStep === 2 && previewData && (
        <div className="space-y-6">
          {/* Duplicate Batch Warning Banner if detected */}
          {previewData.isDuplicateFile && (
            <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <h4 className="font-bold">Duplicate File Upload Detected</h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  An identical file with file hash <code className="font-mono">{previewData.fileHash.slice(0, 10)}...</code> was
                  previously imported on{' '}
                  <strong>{new Date(previewData.previousBatch.uploadedAt).toLocaleString()}</strong>.
                  Importing will create new orders. Existing dispatches will NEVER be overwritten.
                </p>
              </div>
            </div>
          )}

          {/* Multi-Tab Selector Banner */}
          {previewData.availableSheets && previewData.availableSheets.length > 1 && (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50/70 text-red-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-red-800">
                    Multiple Tabs Detected in Excel File
                  </h4>
                  <p className="text-xs text-red-700 mt-0.5">
                    Aapki file me <strong>{previewData.availableSheets.length} sheets/tabs</strong> hain. System ne automatically sabse latest tab select ki hai.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-red-900 whitespace-nowrap">Active Tab:</span>
                <select
                  value={previewData.selectedSheetName || ''}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  disabled={isParsing}
                  className="bg-white border border-red-300 text-red-900 font-bold text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-600 shadow-xs cursor-pointer"
                >
                  {previewData.availableSheets.map((sName, sIdx) => (
                    <option key={sName} value={sName}>
                      {sName} {sIdx === previewData.availableSheets!.length - 1 ? '🌟 (Latest / Aaj ki sheet)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Validation Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Rows Parsed</span>
              <div className="text-2xl font-bold text-slate-800 mt-1">{previewData.totalRows}</div>
              <p className="text-xs text-slate-400 mt-0.5">From file: {previewData.originalFileName}</p>
            </div>
            <div className="bg-emerald-50/70 p-5 rounded-xl border border-emerald-200/80 shadow-sm">
              <span className="text-xs font-semibold text-emerald-700 uppercase">Valid Rows Ready</span>
              <div className="text-2xl font-bold text-emerald-800 mt-1">{previewData.validRowsCount}</div>
              <p className="text-xs text-emerald-600 mt-0.5">Passed all schema constraints</p>
            </div>
            <div className="bg-rose-50/70 p-5 rounded-xl border border-rose-200/80 shadow-sm">
              <span className="text-xs font-semibold text-rose-700 uppercase">Invalid Rows Found</span>
              <div className="text-2xl font-bold text-rose-800 mt-1">{previewData.invalidRowsCount}</div>
              <p className="text-xs text-rose-600 mt-0.5">Will be skipped from import</p>
            </div>
          </div>

          {/* Strict Validation Banner: If any invalid rows exist */}
          {previewData.invalidRowsCount > 0 && (
            <div className="p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 flex items-start gap-3 shadow-xs">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <h4 className="font-bold text-rose-800 text-sm">
                  ⚠️ Excel Upload Blocked: {previewData.invalidRowsCount} Row(s) me Data Missing ya Galat hai!
                </h4>
                <p className="text-xs text-rose-700 mt-1">
                  Excel sheet tabhi import ho sakti hai jab <strong>sabhi rows me pura data</strong> (Student Name, Mobile Number, Tracking ID, Weight, Course/Book) bhara hua ho. Kripya niche invalid rows dekhein ya "Download Invalid Rows" par click karke error theek karein aur dobara upload karein.
                </p>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={resetWizard} icon={<RefreshCw className="w-3.5 h-3.5" />}>
                Upload Another File
              </Button>
              {previewData.invalidRowsCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadInvalidRows}
                  isLoading={isDownloadingErrors}
                  icon={<Download className="w-3.5 h-3.5 text-rose-600" />}
                >
                  Download Invalid Rows (.xlsx)
                </Button>
              )}
            </div>

            <Button
              variant="primary"
              disabled={previewData.validRowsCount === 0 || previewData.invalidRowsCount > 0}
              onClick={() => setConfirmModalOpen(true)}
              icon={previewData.invalidRowsCount > 0 ? <AlertTriangle className="w-4 h-4 text-rose-300" /> : <CheckCircle2 className="w-4 h-4" />}
            >
              {previewData.invalidRowsCount > 0
                ? `Upload Blocked (${previewData.invalidRowsCount} Invalid Rows)`
                : `Confirm & Import ${previewData.validRowsCount} Orders`}
            </Button>
          </div>

          {/* Detailed Invalid Rows Table (if any) */}
          {previewData.invalidRowsCount > 0 && (
            <Card
              title={`Validation Errors (${previewData.invalidRowsCount} rows)`}
              subtitle="The following rows failed validation and will not be imported"
            >
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Row #</th>
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Tracking ID</th>
                      <th className="py-2.5 px-3">Weight</th>
                      <th className="py-2.5 px-3">Book Code</th>
                      <th className="py-2.5 px-3">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.invalidRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-600">{row.rowNumber}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">{row.studentName || '-'}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{row.trackingId || '-'}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{row.weight || '-'}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{row.bookCode || '-'}</td>
                        <td className="py-2.5 px-3 text-rose-600">
                          <ul className="list-disc list-inside space-y-0.5">
                            {row.errors.map((err: string, eIdx: number) => (
                              <li key={eIdx}>{err}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Valid Rows Preview Table */}
          <Card
            title={`Preview Valid Records (${previewData.validRowsCount} rows)`}
            subtitle="Sample of student orders that will be committed to the database"
          >
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Row #</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-3">Mobile Number</th>
                    <th className="py-2.5 px-3">Tracking ID</th>
                    <th className="py-2.5 px-3">Weight</th>
                    <th className="py-2.5 px-3">Book Code</th>
                    <th className="py-2.5 px-3">Book Name</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.validRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 font-mono text-slate-400">{row.rowNumber}</td>
                      <td className="py-2 px-3 font-medium text-slate-800">{row.studentName}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{row.mobileNumber}</td>
                      <td className="py-2 px-3 font-mono font-medium text-red-600">{row.trackingId}</td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-700 bg-slate-50">{row.weight || '-'}</td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-800">{row.bookCode}</td>
                      <td className="py-2 px-3 text-slate-600">{row.bookName}</td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-800 text-right">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewData.validRowsCount > 50 && (
                <div className="p-3 text-center text-xs text-slate-400 border-t border-slate-100">
                  Showing first 50 rows of {previewData.validRowsCount} valid records.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* STEP 3: Final Import Summary & Immediate Outgoing Sheet View */}
      {currentStep === 3 && importSummary && (
        <div className="space-y-6">
          <Card title="Import Completed Successfully!">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-2">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-xs shrink-0">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    {importSummary.fileName} Imported Successfully
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Orders have been created and added directly into the Outgoing Sheet queue.
                  </p>
                  {importSummary.whatsappNotifications && (
                    <p className="text-xs text-slate-600 mt-1">
                      WhatsApp webhook accepted {importSummary.whatsappNotifications.accepted} of{' '}
                      {importSummary.whatsappNotifications.total} messages
                      {importSummary.whatsappNotifications.notAccepted > 0 &&
                        `; ${importSummary.whatsappNotifications.notAccepted} were not accepted`}
                      .
                    </p>
                  )}
                  {importSummary.emailNotifications && (
                    <p className="text-xs text-slate-600 mt-1">
                      Email server accepted {importSummary.emailNotifications.accepted} of{' '}
                      {importSummary.emailNotifications.total} messages
                      {importSummary.emailNotifications.notAccepted > 0 &&
                        `; ${importSummary.emailNotifications.notAccepted} were not accepted`}
                      .
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6 text-center bg-slate-50 border border-slate-200/80 rounded-xl px-5 py-3">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Orders Created</div>
                  <div className="text-xl font-bold font-mono text-emerald-600">{importSummary.importedOrders}</div>
                </div>
                <div className="h-8 w-px bg-slate-200" />
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Book Items</div>
                  <div className="text-xl font-bold font-mono text-slate-800">{importSummary.importedItems}</div>
                </div>
                <div className="h-8 w-px bg-slate-200" />
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Valid Rows</div>
                  <div className="text-xl font-bold font-mono text-red-600">{importSummary.validRows}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant="outline" size="sm" onClick={resetWizard}>
                  Upload Another File
                </Button>
                <button
                  onClick={() => navigate('/admin/barcode-sheet')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <ScanLine size={15} />
                  <span>👉 Open Student Barcode Sheet (बारकोड शीट खोलें व स्कैन करें)</span>
                </button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/admin/outgoing-orders')}
                  icon={<ArrowRightCircle className="w-4 h-4" />}
                >
                  Outgoing Sheet
                </Button>
              </div>
            </div>
          </Card>

          {/* Newly Imported Orders in Outgoing Sheet ("jo exel upload kare vo outgoing sheet me bhi dekhna chahiye") */}
          <Card
            title={`Newly Uploaded Orders in Outgoing Sheet (${batchOrders.length})`}
            subtitle="These student orders are now live. Click 'Dispatch Box' to verify & dispatch books."
          >
            {batchOrders.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                Loading newly imported orders...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Student & Mobile</th>
                      <th className="py-3 px-4">Tracking ID</th>
                      <th className="py-3 px-4">Books Required</th>
                      <th className="py-3 px-4 text-center">Required</th>
                      <th className="py-3 px-4 text-center">Pending</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Dispatch Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batchOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">{ord.studentName}</div>
                          <div className="text-[11px] font-mono text-slate-500">{ord.mobileNumber}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="font-mono font-bold text-red-600">
                              {ord.trackingId}
                            </span>
                            {ord.productCode && (
                              <span className="font-mono text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200" title="Product Code">
                                📦 {ord.productCode}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {ord.items.map((it) => (
                              <span
                                key={it.id}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold"
                              >
                                {it.bookCode} ×{it.requiredQuantity}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                          {ord.totalRequired}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-amber-600">
                          {ord.totalPending}
                        </td>
                        <td className="py-3 px-4">
                          <Badge status={ord.status} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setSelectedDispatchOrder(ord);
                              setIsDispatchBoxOpen(true);
                            }}
                            icon={<PackageOpen className="w-3.5 h-3.5" />}
                          >
                            Dispatch Box
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Dispatch Box Modal */}
      <DispatchBoxModal
        isOpen={isDispatchBoxOpen}
        onClose={() => {
          setIsDispatchBoxOpen(false);
          setSelectedDispatchOrder(null);
        }}
        order={selectedDispatchOrder}
        onOrderUpdated={(updated) => {
          setBatchOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
          setSelectedDispatchOrder(updated);
        }}
      />

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Confirm Database Import"
        subtitle={`File: ${previewData?.originalFileName}`}
      >
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            You are about to import <strong>{previewData?.validRowsCount}</strong> valid student order items into PostgreSQL.
          </p>
          {previewData?.invalidRowsCount ? (
            <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
              Note: <strong>{previewData.invalidRowsCount}</strong> invalid rows will be skipped. You can download the error
              report if needed.
            </p>
          ) : null}

          {previewData?.isDuplicateFile && (
            <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              Warning: This exact file was uploaded before. Proceeding will add new order records with batch ID.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setConfirmModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmImport} isLoading={isImporting}>
              Confirm & Save to Database
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
