import React, { useState, useEffect } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useToast } from '../../context/ToastContext';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import api from '../../services/api';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Clock,
  User,
  Zap,
  Edit,
  FileCheck2,
} from 'lucide-react';

export const SecurityPage: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [pinStatus, setPinStatus] = useState<{
    isConfigured: boolean;
    updatedAt: string | null;
    updatedByUserName: string | null;
  }>({
    isConfigured: false,
    updatedAt: null,
    updatedByUserName: null,
  });

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPinStatus = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/security/status');
      if (res.data.success) {
        setPinStatus(res.data.data);
      }
    } catch (err: any) {
      toastError(err.response?.data?.message || 'Failed to fetch security PIN status.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPinStatus();
  }, []);

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPin = newPin.trim();
    const cleanConfirm = confirmPin.trim();

    if (!cleanPin || !cleanConfirm) {
      toastError('Please fill in both PIN fields.');
      return;
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      toastError('Security PIN must be exactly 4 numeric digits (0000 - 9999).');
      return;
    }

    if (cleanPin !== cleanConfirm) {
      toastError('PIN and Confirm PIN do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.post('/security/set-pin', { pin: cleanPin });
      if (res.data.success) {
        toastSuccess('4-digit Security PIN updated successfully!');
        setNewPin('');
        setConfirmPin('');
        fetchPinStatus();
      }
    } catch (err: any) {
      toastError(err.response?.data?.message || 'Failed to save Security PIN.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-red-100 text-red-600 rounded-xl shadow-xs">
          <Lock className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">System Security</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Configure the 4-digit Security PIN required for manual dispatch verification and order editing
          </p>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner message="Loading security configuration..." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* PIN Setup Card */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-red-600" />
                  <h2 className="text-sm font-bold text-slate-800">
                    {pinStatus.isConfigured ? 'Update 4-Digit Security PIN' : 'Set 4-Digit Security PIN'}
                  </h2>
                </div>

                {pinStatus.isConfigured ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>PIN Active</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Not Configured</span>
                  </span>
                )}
              </div>

              <form onSubmit={handleSavePin} className="space-y-4 max-w-md">
                {/* New PIN */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    New 4-Digit Security PIN <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      maxLength={4}
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="e.g. 1234"
                      required
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-lg font-mono font-bold tracking-widest text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Must be exactly 4 numeric digits (0-9).</p>
                </div>

                {/* Confirm PIN */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Confirm 4-Digit Security PIN <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      maxLength={4}
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Re-enter 4-digit PIN"
                      required
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-lg font-mono font-bold tracking-widest text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isSaving}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 font-bold"
                  >
                    {pinStatus.isConfigured ? 'Update Security PIN' : 'Save Security PIN'}
                  </Button>
                </div>
              </form>

              {pinStatus.updatedAt && (
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Last updated: {new Date(pinStatus.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </span>
                  {pinStatus.updatedByUserName && (
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      By: <strong>{pinStatus.updatedByUserName}</strong>
                    </span>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Side Info & Rules Card */}
          <div className="space-y-4">
            <Card className="p-5 border-l-4 border-l-red-600">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-red-600" />
                <span>Security PIN Enforcement</span>
              </h3>

              <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                    <span>1. Manual Order Dispatch</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    When someone clicks "Quick Dispatch All Books" or "Finish Partial Order" in the Outgoing Sheet without physical barcode scanning, this 4-digit PIN will be required.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Edit className="w-3.5 h-3.5 text-blue-600" />
                    <span>2. Order Editing in Outgoing Sheet</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    When Admin clicks the Edit button on any order to update student details or books, entering this 4-digit PIN is compulsory to verify and commit changes.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>3. Physical Barcode Scanning</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Regular physical barcode scanning remains rapid and automated. Only manual overrides and edits trigger PIN verification.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
