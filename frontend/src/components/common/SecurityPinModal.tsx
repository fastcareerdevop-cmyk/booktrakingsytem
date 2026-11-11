import React, { useState, useRef, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { ShieldCheck, Lock, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react';
import api from '../../services/api';

interface SecurityPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pin: string) => void | Promise<void>;
  title?: string;
  description?: string;
  actionLabel?: string;
}

export const SecurityPinModal: React.FC<SecurityPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Security Authorization Required',
  description = 'Please enter the 4-digit Admin Security PIN to confirm this action.',
  actionLabel = 'Authorize Action',
}) => {
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setPinDigits(['', '', '', '']);
      setErrorMsg('');
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    }
  }, [isOpen]);

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1); // Only allow 0-9
    const newDigits = [...pinDigits];
    newDigits[index] = digit;
    setPinDigits(newDigits);
    setErrorMsg('');

    // Auto-advance to next input
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      const fullPin = pinDigits.join('');
      if (fullPin.length === 4) {
        handleConfirm();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length > 0) {
      const newDigits = ['', '', '', ''];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setPinDigits(newDigits);
      const nextFocus = Math.min(pasted.length, 3);
      inputRefs.current[nextFocus]?.focus();
    }
  };

  const handleConfirm = async () => {
    const fullPin = pinDigits.join('');
    if (fullPin.length !== 4) {
      setErrorMsg('Please enter a 4-digit Security PIN.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');
    try {
      // First verify against backend endpoint
      await api.post('/security/verify', { pin: fullPin });
      // If valid, invoke success callback
      await onSuccess(fullPin);
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Incorrect Security PIN. Please try again.';
      setErrorMsg(msg);
      setPinDigits(['', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="space-y-5 text-center p-2">
        <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-sm">
          <KeyRound className="w-7 h-7" />
        </div>

        <div>
          <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
            {description}
          </p>
        </div>

        {/* 4-Digit Box Input */}
        <div className="flex justify-center items-center gap-3 py-2" onPaste={handlePaste}>
          {[0, 1, 2, 3].map((idx) => (
            <input
              key={idx}
              ref={(el) => (inputRefs.current[idx] = el)}
              type={showPin ? 'text' : 'password'}
              maxLength={1}
              value={pinDigits[idx]}
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className="w-12 h-14 text-center text-xl font-bold bg-slate-50 border-2 border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 focus:bg-white transition-all shadow-inner"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
            />
          ))}
        </div>

        {/* Show/Hide PIN Toggle */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium cursor-pointer"
          >
            {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
            <span>{showPin ? 'Hide PIN' : 'Show PIN'}</span>
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-center gap-1.5 font-semibold animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <Button variant="outline" onClick={onClose} disabled={isVerifying}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            isLoading={isVerifying}
            className="bg-red-600 hover:bg-red-700 font-bold px-6"
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
