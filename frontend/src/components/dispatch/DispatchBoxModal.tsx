import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { Order, OrderItem } from '../../types';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import {
  Barcode,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  PackageCheck,
  User,
  Phone,
  Hash,
  ArrowRight,
  Volume2,
  VolumeX,
  History,
  RotateCcw,
  X,
} from 'lucide-react';
import { playSuccessChime, playErrorTone, playOrderCompleteFanfare, speakVoiceAnnouncement, speakVoiceTwice, speakErrorMessage } from '../../utils/sound';

interface DispatchBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onOrderUpdated?: (updatedOrder: Order) => void;
  onProceedNextOrder?: () => void;
  hasNextOrder?: boolean;
}

export const DispatchBoxModal: React.FC<DispatchBoxModalProps> = ({
  isOpen,
  onClose,
  order,
  onOrderUpdated,
  onProceedNextOrder,
  hasNextOrder = false,
}) => {
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastDispatchedItemId, setLastDispatchedItemId] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<
    Array<{ id: string; code: string; bookName: string; timestamp: string }>
  >([]);

  // Paytm-style Circular Checkmark ("RIGHT KA CLICK") state
  const [showPaytmSuccess, setShowPaytmSuccess] = useState(false);
  const showPaytmSuccessRef = useRef(false);
  const autoCloseTimerRef = useRef<any>(null);
  const isVerifyingRef = useRef(false);

  useEffect(() => {
    showPaytmSuccessRef.current = showPaytmSuccess;
  }, [showPaytmSuccess]);

  // Tracking ID Match State (Optional)
  const [trackingInput, setTrackingInput] = useState('');
  const [trackingMatchStatus, setTrackingMatchStatus] = useState<'idle' | 'matched' | 'mismatch'>('idle');
  const [trackingErrorMessage, setTrackingErrorMessage] = useState('');
  const trackingInputRef = useRef<HTMLInputElement>(null);
  const [matchCountdown, setMatchCountdown] = useState(5);
  const matchTimerRef = useRef<any>(null);
  const recentlyCompletedCodesRef = useRef<Map<string, number>>(new Map());

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'completed' | null;
    message: string;
    bookTitle?: string;
    bookCode?: string;
  }>({ type: null, message: '' });

  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize activeOrder whenever order prop changes or modal opens
  useEffect(() => {
    if (order) {
      setActiveOrder(order);
      setEnteredCode('');
      setFeedback({ type: null, message: '' });
      setLastDispatchedItemId(null);
      setScanHistory([]);
      setShowPaytmSuccess(false);
      setTrackingInput('');
      setTrackingMatchStatus('idle');
      setTrackingErrorMessage('');
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    }
  }, [order, isOpen]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      if (matchTimerRef.current) clearInterval(matchTimerRef.current);
    };
  }, []);

  const handleDismissSuccessOverlay = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    if (matchTimerRef.current) {
      clearInterval(matchTimerRef.current);
      matchTimerRef.current = null;
    }
    setShowPaytmSuccess(false);
    setEnteredCode('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setTrackingInput('');
    setTrackingMatchStatus('idle');
    setTrackingErrorMessage('');
    setMatchCountdown(5);

    if (hasNextOrder && onProceedNextOrder) {
      onProceedNextOrder();
    } else {
      onClose();
    }
  };

  const handleVerifyTrackingCode = (scannedRaw: string) => {
    const scanned = scannedRaw.trim().toUpperCase();
    if (!scanned || !activeOrder) return;

    const cleanScanned = scanned.replace(/[\s\-_]/g, '');
    const cleanExpectedTracking = (activeOrder.trackingId || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
    const cleanExpectedOrder = (activeOrder.orderCode || '').trim().toUpperCase().replace(/[\s\-_]/g, '');

    const isMatch = (cleanExpectedTracking && cleanScanned === cleanExpectedTracking) ||
                    (cleanExpectedOrder && cleanScanned === cleanExpectedOrder);

    if (isMatch) {
      if (trackingMatchStatus === 'matched') return;

      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
      if (matchTimerRef.current) {
        clearInterval(matchTimerRef.current);
        matchTimerRef.current = null;
      }
      setTrackingMatchStatus('matched');
      setTrackingErrorMessage('');
      setMatchCountdown(5);

      // Register completed order codes
      const now = Date.now();
      if (activeOrder.trackingId) recentlyCompletedCodesRef.current.set(activeOrder.trackingId, now);
      if (activeOrder.orderCode) recentlyCompletedCodesRef.current.set(activeOrder.orderCode, now);
      if (scanned) recentlyCompletedCodesRef.current.set(scanned, now);

      if (soundEnabled) {
        playSuccessChime();
        speakVoiceAnnouncement('Tracking ID matched successfully! Parcel verified. Order complete.');
      }

      // Show screen for exactly 5 seconds before automatically moving to next order
      matchTimerRef.current = setInterval(() => {
        setMatchCountdown((prev) => {
          if (prev <= 1) {
            if (matchTimerRef.current) clearInterval(matchTimerRef.current);
            matchTimerRef.current = null;
            handleDismissSuccessOverlay();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // ❌ Mismatch: STAY ON SCREEN until correct ID is scanned!
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
      setShowPaytmSuccess(true);
      showPaytmSuccessRef.current = true;
      setTrackingMatchStatus('mismatch');
      setTrackingErrorMessage(`Scanned: "${scanned}" | Sahi Tracking ID: "${activeOrder.trackingId || activeOrder.orderCode || 'N/A'}"`);
      if (soundEnabled) {
        playErrorTone();
        speakErrorMessage('Galat tracking ID. Kripya sahi parcel scan karein.');
      }
      setTrackingInput('');
      setTimeout(() => {
        trackingInputRef.current?.focus();
      }, 50);
    }
  };

  const handleTrackingSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    handleVerifyTrackingCode(trackingInput);
  };

  // Focus tracking input automatically when success overlay appears & redirect typing to it
  useEffect(() => {
    if (!showPaytmSuccess) return;

    const timer = setTimeout(() => {
      trackingInputRef.current?.focus();
    }, 120);

    const handleKeyDown = (e: KeyboardEvent) => {
      // If user presses Escape key while overlay is open, immediately skip & proceed to next order!
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismissSuccessOverlay();
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key.length === 1 || e.key === 'Enter') {
        trackingInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPaytmSuccess]);

  // Focus input automatically whenever modal opens or an item is scanned
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeOrder?.totalPending]);

  if (!activeOrder) return null;

  const totalRequired = activeOrder.totalRequired;
  const totalDispatched = activeOrder.totalDispatched;
  const totalPending = activeOrder.totalPending;
  const isOrderFullyCompleted = totalPending === 0 || activeOrder.status === 'COMPLETED';
  const completionPercentage =
    totalRequired > 0 ? Math.round((totalDispatched / totalRequired) * 100) : 0;

  const handleScanOrSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = enteredCode.trim().toUpperCase();

    // 1. If currently in 10s celebration countdown after tracking ID match, IGNORE ALL SCANS!
    if (trackingMatchStatus === 'matched') {
      return;
    }

    // 2. If this code belongs to an order that was recently completed, SILENTLY IGNORE IT!
    const now = Date.now();
    for (const [c, timestamp] of recentlyCompletedCodesRef.current.entries()) {
      if (now - timestamp > 60000) {
        recentlyCompletedCodesRef.current.delete(c);
      }
    }
    const cleanNoPunct = code.replace(/[\s\-_]/g, '');
    let isRecentlyDone = false;
    for (const [compCode] of recentlyCompletedCodesRef.current.entries()) {
      if (compCode && compCode.replace(/[\s\-_]/g, '') === cleanNoPunct) {
        isRecentlyDone = true;
        break;
      }
    }
    if (isRecentlyDone) {
      console.log('Silently suppressing re-scan of completed order:', code);
      setEnteredCode('');
      return;
    }

    // 🔒 If Confirmation / Tracking ID overlay is open, ALL scans are for Tracking verification!
    if (showPaytmSuccessRef.current || showPaytmSuccess) {
      handleVerifyTrackingCode(code);
      setEnteredCode('');
      return;
    }

    if (!code || isVerifying || isVerifyingRef.current || isOrderFullyCompleted) {
      if (isOrderFullyCompleted && code) {
        setFeedback({
          type: 'warning',
          message: '❌ Yeh order pehle se hi fully dispatch ho chuka hai! Dobara scan nahi hoga aur books kam nahi hongi.',
        });
        if (soundEnabled) {
          playErrorTone();
          speakErrorMessage('This order is already fully dispatched. Duplicate scan not allowed.');
        }
      }
      return;
    }

    isVerifyingRef.current = true;
    setIsVerifying(true);
    setEnteredCode('');
    setFeedback({ type: null, message: '' });

    const idempotencyKey = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      const res = await api.post('/dispatch/verify', {
        orderId: activeOrder.id,
        enteredCode: code,
        enteredBookCode: code,
        requestId: idempotencyKey,
      });

      if (res.data.success) {
        const isLoadedOnly = res.data.data.scanType === 'ORDER_LOADED';
        const isOrderScan = res.data.data.scanType === 'ORDER_CODE';
        const isProductScan = res.data.data.scanType === 'PRODUCT_CODE';
        const updatedOrderData: Order = res.data.data.order;
        const updatedItemData: OrderItem | undefined = res.data.data.orderItem;
        const hasStockWarning = Boolean(res.data.data.stockWarning);

        setActiveOrder(updatedOrderData);
        if (updatedItemData) {
          setLastDispatchedItemId(updatedItemData.id);
        }

        // 🌟 If another student barcode was scanned while modal is open, switch directly to that student!
        if (isLoadedOnly) {
          setShowPaytmSuccess(false);
          setScanHistory([]);
          if (soundEnabled) {
            playSuccessChime();
            speakVoiceAnnouncement(`New order received. Order for ${updatedOrderData.studentName}`);
          }
          setFeedback({
            type: 'success',
            message: `Order for ${updatedOrderData.studentName} loaded! Scan Product Code or Book Code to dispatch.`,
          });
          if (onOrderUpdated) {
            onOrderUpdated(updatedOrderData);
          }
          return;
        }

        // Add to live scan log
        const logBookName = isOrderScan
          ? `All order books dispatched (${res.data.data.itemsDispatched} items)`
          : isProductScan
          ? `Product (${code}) dispatched (${res.data.data.itemsDispatched || 1} items)`
          : (updatedItemData?.bookName || 'Book');

        const newLogEntry = {
          id: idempotencyKey,
          code: isOrderScan
            ? (res.data.data.orderCode || code)
            : isProductScan
            ? (res.data.data.productCode || code)
            : (updatedItemData?.bookCode || code),
          bookName: logBookName,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: true }),
        };
        setScanHistory((prev) => [newLogEntry, ...prev.slice(0, 9)]);

        // Notify parent sheet/table for instant synchronization
        if (onOrderUpdated) {
          onOrderUpdated(updatedOrderData);
        }

        const orderIsNowComplete = updatedOrderData.totalPending === 0;

        if (orderIsNowComplete) {
          // 🎉 ORDER FULL FILLED / COMPLETED! (All products & books verified)
          // 1. Play 4-note celebration fanfare & speak Paytm-style voice announcement twice
          if (soundEnabled) {
            playOrderCompleteFanfare();
            speakVoiceAnnouncement('Order of upcoming CA is fulfilled at FAST Education. Next order, please.');
          }

          // 2. Show the animated Paytm circular checkmark ("RIGHT KA CLICK") overlay
          setShowPaytmSuccess(true);
          if (autoCloseTimerRef.current) {
            clearTimeout(autoCloseTimerRef.current);
            autoCloseTimerRef.current = null;
          }

          setFeedback({
            type: 'completed',
            message: res.data.data.message || `All books for ${activeOrder.studentName} have been verified & dispatched! Order Complete.`,
            bookTitle: isOrderScan
              ? 'Entire Order Dispatched'
              : isProductScan
              ? 'All Products Dispatched'
              : updatedItemData?.bookName,
            bookCode: isOrderScan
              ? (res.data.data.orderCode || code)
              : isProductScan
              ? (res.data.data.productCode || code)
              : updatedItemData?.bookCode,
          });
        } else if (isProductScan) {
          // One product scanned, but other products/books are still pending in this order
          if (soundEnabled) playSuccessChime();
          const itemsCount = res.data.data.itemsDispatched || 1;
          setFeedback({
            type: 'success',
            message: res.data.data.message || `Product "${code}" verified (${itemsCount} books). ${updatedOrderData.totalPending} item(s) still remaining in this order!`,
            bookTitle: 'Product Verified',
            bookCode: code,
          });
        } else if (hasStockWarning) {
          if (soundEnabled) playSuccessChime();
          setFeedback({
            type: 'warning',
            message: res.data.data.stockWarning,
            bookTitle: updatedItemData?.bookName,
            bookCode: updatedItemData?.bookCode,
          });
        } else {
          if (soundEnabled) playSuccessChime();
          const remainingMsg =
            updatedItemData && updatedItemData.pendingQuantity > 0
              ? `${updatedItemData.pendingQuantity} copy remaining for this book`
              : 'All copies for this book dispatched';

          setFeedback({
            type: 'success',
            message: res.data.data.message || `1 copy of "${updatedItemData?.bookCode}" dispatched successfully! (${remainingMsg})`,
            bookTitle: updatedItemData?.bookName,
            bookCode: updatedItemData?.bookCode,
          });
        }

        // Reset code input for the next physical book scan
        setEnteredCode('');
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    } catch (err: any) {
      const errCode = err.response?.data?.code;
      const serverMsg =
        err.response?.data?.message ||
        `Warning: Book code "${code}" does not match any pending books for this student order.`;

      // If order is already completed, do NOT sound error tone or voice! Silently suppress!
      if (errCode === 'ORDER_ALREADY_COMPLETED') {
        recentlyCompletedCodesRef.current.set(code, Date.now());
        setFeedback({ type: null, message: '' });
        return;
      }

      if (soundEnabled) {
        playErrorTone();
        speakErrorMessage(serverMsg);
      }

      setFeedback({
        type: 'warning',
        message: serverMsg,
      });

      // Highlight input so user can re-scan or fix
      setTimeout(() => {
        inputRef.current?.select();
      }, 50);
    } finally {
      setIsVerifying(false);
      setTimeout(() => {
        isVerifyingRef.current = false;
        inputRef.current?.focus();
      }, 150);
    }
  };

  const handleQuickCodeFill = (codeToFill: string) => {
    setEnteredCode(codeToFill);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  return (
    <>
      {/* ─── Paytm-style Circular Checkmark Success Overlay ("RIGHT KA CLICK") ─── */}
      {showPaytmSuccess && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl p-7 max-w-sm w-full mx-auto shadow-2xl text-center transform scale-100 transition-all border border-emerald-100 relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Close Button (X) */}
            <button
              onClick={handleDismissSuccessOverlay}
              className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close and scan next"
            >
              <X size={20} />
            </button>

            {/* Soft background ambient glow */}
            <div className="absolute -top-12 -left-12 w-36 h-36 bg-emerald-100 rounded-full blur-2xl opacity-70 pointer-events-none" />
            <div className="absolute -bottom-12 -right-12 w-36 h-36 bg-teal-100 rounded-full blur-2xl opacity-70 pointer-events-none" />

            {/* Paytm Circular Checkmark with Ripple Waves */}
            <div className="relative flex items-center justify-center w-28 h-28 mx-auto mb-3">
              <div className="absolute inset-0 rounded-full bg-emerald-400/25 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-emerald-500/20 animate-pulse" />
              
              <svg className="w-24 h-24 text-emerald-500 relative z-10 drop-shadow-md" viewBox="0 0 52 52">
                <circle
                  className="animate-paytm-circle"
                  cx="26"
                  cy="26"
                  r="24"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3.5"
                />
                <path
                  className="animate-paytm-check"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.1 27.2l7.1 7.2 16.7-16.8"
                />
              </svg>
            </div>

            {/* Confirmation Banner */}
            <div className="inline-block bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full mb-1 border border-emerald-200">
              ✓ ORDER VERIFIED & DISPATCHED
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">
              {activeOrder.studentName || 'Order Completed!'}
            </h3>
            <p className="text-xs font-semibold text-emerald-600 mt-0.5 flex items-center justify-center gap-1.5">
              <span>All Books Verified & Full Filled</span>
            </p>

            {/* ─── Tracking ID Match Section (Optional) ─── */}
            <div className="mt-3.5 pt-3 border-t border-slate-100 text-left">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Tracking ID Match (Optional):</span>
                </span>
                {activeOrder.trackingId && (
                  <span className="font-mono text-[11px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                    {activeOrder.trackingId}
                  </span>
                )}
              </div>

              {trackingMatchStatus === 'matched' ? (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950 space-y-2 shadow-sm animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-700 font-black text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>Tracking ID Matched Successfully!</span>
                  </div>
                  <div className="text-xs text-emerald-800 font-medium">
                    Parcel verified & confirmed. Order is fully complete.
                  </div>
                  {activeOrder.trackingId && (
                    <div className="font-mono text-xs font-bold bg-white px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-800 inline-block">
                      Tracking ID: {activeOrder.trackingId}
                    </div>
                  )}
                  <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5 pt-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span>Next order will load automatically in <strong className="font-mono text-emerald-900 text-xs font-black">{matchCountdown}s</strong></span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleTrackingSubmit} className="space-y-1.5">
                  <div className="relative flex items-center">
                    <input
                      ref={trackingInputRef}
                      type="text"
                      value={trackingInput}
                      onChange={(e) => setTrackingInput(e.target.value.toUpperCase())}
                      placeholder={trackingMatchStatus === 'mismatch' ? "⚠️ Sahi Tracking ID scan karein..." : "Scan or type Tracking ID from parcel..."}
                      className={`w-full px-3 py-2 pr-16 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                        trackingMatchStatus === 'mismatch'
                          ? 'bg-rose-50 border-2 border-rose-500 text-rose-900 focus:ring-2 focus:ring-rose-300'
                          : 'bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                      }`}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!trackingInput.trim()}
                      className="absolute right-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                    >
                      Match
                    </button>
                  </div>

                  {trackingMatchStatus === 'mismatch' && (
                    <div className="p-3 rounded-xl bg-rose-50 border-2 border-rose-500 text-rose-900 text-xs font-medium space-y-1 shadow-sm">
                      <div className="flex items-center gap-1.5 text-rose-700 font-bold text-xs">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>⚠️ Galat Tracking ID! / Tracking ID Mismatch</span>
                      </div>
                      <div className="font-mono text-[11px] bg-white px-2 py-1 rounded border border-rose-200 text-rose-800 break-all font-semibold">
                        {trackingErrorMessage}
                      </div>
                      <div className="text-[11px] text-rose-700 font-semibold pt-0.5">
                        Kripya sahi parcel ka barcode scan karein. Yeh screen sahi barcode scan hone tak khuli rahegi.
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Action buttons footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-1.5 text-slate-500">
                {trackingMatchStatus === 'mismatch' ? (
                  <span className="text-rose-600 font-bold flex items-center gap-1 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>Waiting for match...</span>
                  </span>
                ) : trackingMatchStatus === 'matched' ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span>Next in: <strong className="font-mono text-emerald-900 font-black">{matchCountdown}s</strong></span>
                  </span>
                ) : (
                  <span className="text-slate-500 text-[11px] font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Scan Tracking ID ya Skip karein</span>
                  </span>
                )}
              </div>

              <button
                onClick={handleDismissSuccessOverlay}
                className={`px-4 py-2 font-bold rounded-xl text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                  trackingMatchStatus === 'mismatch'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <span>
                  {trackingMatchStatus === 'mismatch'
                    ? 'Skip & Next (Esc)'
                    : trackingMatchStatus === 'matched'
                    ? (hasNextOrder ? `Next Order Now (${matchCountdown}s)` : `Done & Close (${matchCountdown}s)`)
                    : (hasNextOrder ? 'अगला आर्डर (Esc / Skip)' : 'Done & Close (Esc)')}
                </span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Book Dispatch & Barcode Verification Box"
        subtitle="Scan or enter book codes one by one to verify and decrement remaining quantities"
        maxWidth="6xl"
      >
        <div className="space-y-4">
          {/* ─── 2-COLUMN HORIZONTAL ("AADA") LAYOUT (Active on Tablets, Laptops & Desktops) ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5 items-start">
            
            {/* ─── LEFT HALF: COURSE, STUDENT DETAILS & SCANNER INPUT ─── */}
            <div className="space-y-3.5">
              {/* 1. HIGHLIGHTED: COURSE / ORDER ITEM */}
              <div className="p-3.5 rounded-2xl bg-[#DE3744] text-white shadow-xl border-2 border-[#ff838c]/40 ring-2 ring-[#DE3744]/30">
                {/* Big Font Highlighted Item Name */}
                <div className="space-y-2">
                  {(() => {
                    const productNames = Array.from(new Set(activeOrder.items?.map((i: any) => i.productName).filter(Boolean) || []));
                    if (productNames.length > 0) {
                      return (
                        <div className="text-xl sm:text-2xl font-black text-white tracking-wide leading-tight drop-shadow-md">
                          📦 {productNames.join(' + ')}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Book Titles in Big Highlighted Badges */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {activeOrder.items?.map((item: any, idx: number) => (
                      <div
                        key={item.id || idx}
                        className="bg-black/25 backdrop-blur-sm px-2.5 py-1 rounded-xl border border-white/30 flex items-center gap-2 shadow-xs"
                      >
                        <span className="text-xs sm:text-sm font-black text-white">{item.bookName}</span>
                        <span className="font-mono text-[11px] font-black bg-white text-[#DE3744] px-2 py-0.5 rounded-md shadow-2xs">
                          {item.bookCode}
                        </span>
                        <span className="text-[11px] text-white font-bold">
                          ({item.dispatchedQuantity}/{item.requiredQuantity})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. Top Order Information Header & Counters */}
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-3.5 shadow-md border border-slate-700/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-slate-700/80">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-red-500/20 text-red-300 px-2 py-0.5 rounded border border-red-400/30">
                        {activeOrder.trackingId}
                      </span>
                      <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                        {activeOrder.studentName}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 mt-1">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <strong className="font-mono">{activeOrder.mobileNumber}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Sound Toggle & Status */}
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      type="button"
                      onClick={() => setSoundEnabled(!soundEnabled)}
                      className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                        soundEnabled
                          ? 'bg-slate-700 text-red-300 hover:bg-slate-600'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title={soundEnabled ? 'Scanner Sound Enabled' : 'Scanner Sound Muted'}
                    >
                      {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      <span className="text-[11px] hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
                    </button>
                    <Badge status={activeOrder.status} />
                  </div>
                </div>

                {/* Real-time Order Quantities Bar - Compact Size */}
                <div className="grid grid-cols-3 gap-1.5 pt-2 text-center">
                  <div className="bg-slate-800/80 rounded-lg py-1.5 px-2 border border-slate-700/50">
                    <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider block">
                      Total Required
                    </span>
                    <div className="text-sm sm:text-base font-bold font-mono text-white mt-0.5">
                      {totalRequired}
                    </div>
                  </div>

                  <div className="bg-emerald-950/30 rounded-lg py-1.5 px-2 border border-emerald-800/40">
                    <span className="text-[9px] text-emerald-400 uppercase font-semibold tracking-wider block">
                      Dispatched
                    </span>
                    <div className="text-sm sm:text-base font-bold font-mono text-emerald-400 mt-0.5 flex items-center justify-center gap-1">
                      <span>{totalDispatched}</span>
                      {totalDispatched > 0 && <span className="text-xs">✓</span>}
                    </div>
                  </div>

                  <div className={`rounded-lg py-1.5 px-2 border ${
                    totalPending === 0
                      ? 'bg-emerald-900/40 border-emerald-600/50'
                      : 'bg-amber-950/30 border-amber-800/40'
                  }`}>
                    <span className="text-[9px] text-amber-400 uppercase font-semibold tracking-wider block">
                      Remaining
                    </span>
                    <div className="text-sm sm:text-base font-bold font-mono text-amber-400 mt-0.5">
                      {totalPending}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-2.5">
                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-medium mb-1">
                    <span>Student Dispatch Progress</span>
                    <span>
                      {completionPercentage}% ({totalDispatched} of {totalRequired} books)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ease-out ${
                        isOrderFullyCompleted ? 'bg-emerald-400' : 'bg-red-500'
                      }`}
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 3. SCAN / INPUT BOX SECTION (Shifted Under Student Details Card) */}
              <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 shadow-inner">
                <form onSubmit={handleScanOrSubmit} className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="book-code-input"
                      className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <Barcode className="w-4 h-4 text-red-600" />
                      Scan or Type Physical Book Code
                    </label>
                    {totalPending > 0 && (
                      <span className="text-[11px] text-slate-500 font-medium">
                        {totalPending} book{totalPending > 1 ? 's' : ''} left
                      </span>
                    )}
                  </div>

                  <div className="relative flex items-center">
                    <input
                      id="book-code-input"
                      ref={inputRef}
                      type="text"
                      value={enteredCode}
                      onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
                      placeholder={
                        isOrderFullyCompleted
                          ? 'All books for this order have been dispatched!'
                          : 'Type book code (e.g. QB101) & press Enter'
                      }
                      disabled={isVerifying || isOrderFullyCompleted}
                      autoFocus
                      className={`w-full pl-4 pr-24 py-2.5 rounded-xl font-mono font-bold text-sm sm:text-base uppercase tracking-wide transition-all ${
                        isOrderFullyCompleted
                          ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                          : 'bg-white border-2 border-red-500/70 text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-red-100 focus:border-red-600'
                      }`}
                    />

                    <div className="absolute right-2 flex items-center gap-1.5">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!enteredCode.trim() || isVerifying || isOrderFullyCompleted}
                        isLoading={isVerifying}
                      >
                        Verify
                      </Button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>Physical barcode gun scanner & keyboard ready.</span>
                    <span>Press <kbd className="bg-white border border-slate-300 rounded px-1 text-[10px] font-mono">Enter ↵</kbd></span>
                  </p>
                </form>

                {/* Quick-fill chips for pending products & books */}
                {!isOrderFullyCompleted && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-2 text-xs">
                    {/* Product Code chips if order contains multiple products */}
                    {(() => {
                      const pendingProducts = Array.from(
                        new Set(
                          activeOrder.items
                            .filter((item) => item.pendingQuantity > 0 && Boolean(item.productCode && item.productCode.trim()))
                            .map((item) => (item.productCode || '').trim().toUpperCase())
                        )
                      );
                      if (pendingProducts.length === 0) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-purple-50/80 border border-purple-200">
                          <span className="text-purple-800 font-bold text-[11px] mr-1 flex items-center gap-1">
                            <span>📦 Products ({pendingProducts.length}):</span>
                          </span>
                          {pendingProducts.map((pCode) => (
                            <button
                              key={pCode}
                              type="button"
                              onClick={() => handleQuickCodeFill(pCode)}
                              className="font-mono text-[11px] font-black bg-white text-purple-800 border-2 border-purple-300 hover:bg-purple-100 hover:border-purple-500 px-2.5 py-0.5 rounded-lg transition-all flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                              title={`Click to fill Product Code ${pCode}`}
                            >
                              <span>📦 {pCode}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Individual Book chips */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-500 text-[11px] mr-1">Expected:</span>
                      {activeOrder.items
                        .filter((item) => item.pendingQuantity > 0)
                        .map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleQuickCodeFill(item.bookCode)}
                            className="font-mono text-[11px] font-bold bg-white text-red-700 border border-red-200 hover:bg-red-50 hover:border-red-400 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                            title={`Click to fill ${item.bookCode}`}
                          >
                            <span>{item.bookCode}</span>
                            <span className="text-slate-400 font-normal">({item.pendingQuantity})</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* Feedback Banners */}
                {feedback.type === 'completed' && (
                  <div className="mt-2.5 p-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs flex items-center gap-2.5 animate-pulse">
                    <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold text-xs sm:text-sm">{feedback.message}</p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        You can now close this dispatch box or proceed to the next student order.
                      </p>
                    </div>
                  </div>
                )}

                {feedback.type === 'success' && (
                  <div className="mt-2.5 p-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="font-medium">{feedback.message}</div>
                  </div>
                )}

                {feedback.type === 'warning' && (
                  <div className="mt-2.5 p-2.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <div className="font-medium">{feedback.message}</div>
                  </div>
                )}
              </div>

              {/* 4. Live Scanned Activity for this session */}
              {scanHistory.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-[11px]">
                  <div className="flex items-center justify-between text-slate-500 font-medium mb-1.5">
                    <span className="flex items-center gap-1">
                      <History className="w-3.5 h-3.5 text-slate-400" /> Recent Scans in this Box
                    </span>
                    <span>{scanHistory.length} scan{scanHistory.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {scanHistory.map((h) => (
                      <span
                        key={h.id}
                        className="bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-700 font-mono text-[10px]"
                      >
                        ✓ {h.code} <span className="text-slate-400">({h.timestamp})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ─── RIGHT HALF: BOOKS CHECKLIST FOR THIS STUDENT ─── */}
            <div className="space-y-3">
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-700 pb-2.5 mb-2.5 border-b border-slate-100 font-bold">
                  <span className="flex items-center gap-1.5">
                    <PackageCheck className="w-4 h-4 text-[#DE3744]" />
                    Books In This Order ({activeOrder.items.length} titles)
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">Quantity Breakdown</span>
                </div>

                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {activeOrder.items.map((item) => {
                    const isDone = item.pendingQuantity === 0;
                    const isJustScanned = lastDispatchedItemId === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-all ${
                          isJustScanned
                            ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300 shadow-sm'
                            : isDone
                            ? 'bg-slate-50/70 border-slate-200 opacity-80'
                            : 'bg-white border-slate-200 hover:border-red-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isDone
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {isDone ? '✓' : item.dispatchedQuantity + 1}
                          </div>
                          <div className="min-w-0 truncate">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                                {item.bookCode}
                              </span>
                              {item.productCode && (
                                <span className="font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded text-[10px] border border-purple-200" title={`Product Code: ${item.productCode}`}>
                                  📦 {item.productCode}
                                </span>
                              )}
                              <span className="font-semibold text-slate-800 truncate">{item.bookName}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {item.requiredQuantity > 1 ? (
                                <span>
                                  Multiple copies: {item.dispatchedQuantity} of {item.requiredQuantity} dispatched (
                                  <strong className="text-slate-600">{item.pendingQuantity} remaining</strong>)
                                </span>
                              ) : (
                                <span>Single copy order</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Status Indicator */}
                        <div className="flex items-center gap-2.5 text-right shrink-0">
                          <div className="font-mono text-xs">
                            <span className="text-emerald-600 font-bold">{item.dispatchedQuantity}</span>
                            <span className="text-slate-400"> / </span>
                            <span className="text-slate-700 font-bold">{item.requiredQuantity}</span>
                          </div>

                          <Badge status={item.status} size="sm" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Modal Bottom Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center sm:text-left">
              {isOrderFullyCompleted
                ? 'Order is 100% complete. Student package ready to seal.'
                : 'Keep scanning until all books for this order are completed.'}
            </p>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button variant="outline" size="sm" onClick={onClose}>
                {isOrderFullyCompleted ? 'Done & Close' : 'Close Box'}
              </Button>

              {isOrderFullyCompleted && hasNextOrder && onProceedNextOrder && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onProceedNextOrder}
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Next Pending Order
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};
