import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Order, ImportBatch } from '../../types';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Badge } from '../../components/common/Badge';
import { Pagination } from '../../components/common/Pagination';
import { EmptyState } from '../../components/common/EmptyState';
import { Button } from '../../components/common/Button';
import { DateFilterSelect } from '../../components/common/DateFilterSelect';
import { DispatchBoxModal } from '../../components/dispatch/DispatchBoxModal';
import { StockDispatchHistoryModal } from '../../components/dispatch/StockDispatchHistoryModal';
import {
  Search,
  ArrowRight,
  Truck,
  Upload,
  PackageOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  BookOpen,
  ScanLine,
  Package,
  Zap,
  X,
  Tag,
  Trash2,
  Volume2,
  VolumeX,
  Smartphone,
  Mail,
  BarChart2,
  PackageCheck,
  Barcode,
  Phone,
  AlertTriangle,
  Boxes,
  ShieldCheck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { playSuccessChime, playErrorTone, playOrderCompleteFanfare, speakVoiceAnnouncement, speakVoiceTwice, speakErrorMessage } from '../../utils/sound';

export const OutgoingOrdersPage2: React.FC = () => {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);

  // Preparation & Warehouse Stock Split (Shelf vs Packaged)
  const [prepSummary, setPrepSummary] = useState({
    totalAvailableStock: 0,
    shelfStock: 0,
    packagedStock: 0,
  });

  const fetchPrepSummary = useCallback(async () => {
    try {
      const res = await api.get('/preparation/stock-summary');
      if (res.data.success) {
        setPrepSummary({
          totalAvailableStock: res.data.data.totalAvailableStock || 0,
          shelfStock: res.data.data.shelfStock || 0,
          packagedStock: res.data.data.packagedStock || 0,
        });
      }
    } catch (e) {
      console.error('Failed to fetch preparation stock summary:', e);
    }
  }, []);

  useEffect(() => {
    fetchPrepSummary();
  }, [fetchPrepSummary]);

  // Queue Statistics (Live summary)
  const [queueStats, setQueueStats] = useState({
    totalOrders: 0,
    totalRequiredCopies: 0,
    totalDispatchedCopies: 0,
    totalPendingCopies: 0,
  });

  // Filter States
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [batchId, setBatchId] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Available Excel Import Batches
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);

  // Dispatch Box Modal State
  const [selectedOrderForDispatch, setSelectedOrderForDispatch] = useState<Order | null>(null);
  const [isDispatchBoxOpen, setIsDispatchBoxOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Stock Dispatch History Modal
  const [showStockHistory, setShowStockHistory] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  const handleClearAllData = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete ALL existing orders, batches, and dispatch history? This will completely reset the database.'
    );
    if (!confirmed) return;

    setIsClearing(true);
    try {
      await api.post('/orders/clear-all');
      alert('All orders and data have been wiped successfully.');
      fetchOutgoingOrders(1);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to clear orders.');
    } finally {
      setIsClearing(false);
    }
  };

  // ─── Global Scanner State ────────────────────────────────────────────────────
  const [scannerCode, setScannerCode] = useState('');
  const [innerBookCode, setInnerBookCode] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastScannedOrder, setLastScannedOrder] = useState<any>(null);
  const lastScannedOrderRef = useRef<any>(null);
  const innerInputRef = useRef<HTMLInputElement>(null);

  const [showPaytmSuccess, setShowPaytmSuccess] = useState(false);
  const showPaytmSuccessRef = useRef(false);
  const [completedOrderId, setCompletedOrderId] = useState('');
  const completedOrderIdRef = useRef('');
  const [completedStudentName, setCompletedStudentName] = useState('');
  const [completedTrackingId, setCompletedTrackingId] = useState('');
  const completedTrackingIdRef = useRef('');
  const [completedOrderCode, setCompletedOrderCode] = useState('');
  const completedOrderCodeRef = useRef('');
  const [trackingInput, setTrackingInput] = useState('');
  const [trackingMatchStatus, setTrackingMatchStatus] = useState<'idle' | 'matched' | 'mismatch'>('idle');
  const [trackingErrorMessage, setTrackingErrorMessage] = useState('');
  const trackingInputRef = useRef<HTMLInputElement>(null);
  const [matchCountdown, setMatchCountdown] = useState(5);
  const matchTimerRef = useRef<any>(null);
  const recentlyCompletedCodesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    showPaytmSuccessRef.current = showPaytmSuccess;
  }, [showPaytmSuccess]);

  useEffect(() => {
    completedOrderIdRef.current = completedOrderId;
  }, [completedOrderId]);

  useEffect(() => {
    completedTrackingIdRef.current = completedTrackingId;
  }, [completedTrackingId]);

  useEffect(() => {
    completedOrderCodeRef.current = completedOrderCode;
  }, [completedOrderCode]);

  const [scanResult, setScanResult] = useState<{
    type: 'success' | 'error' | null;
    message: string;
    scanType?: string;
    studentName?: string;
    trackingId?: string;
    itemsDispatched?: number;
  }>({ type: null, message: '' });
  const [isScanning, setIsScanning] = useState(false);
  const isScanningRef = useRef(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const autoCloseTimerRef = useRef<any>(null);

  const fetchOrdersRef = useRef<any>(null);

  const handleDismissSuccessOverlay = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    if (matchTimerRef.current) {
      clearInterval(matchTimerRef.current);
      matchTimerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setShowPaytmSuccess(false);
    setScannerCode('');
    if (scanInputRef.current) {
      scanInputRef.current.value = '';
    }
    setTrackingInput('');
    setTrackingMatchStatus('idle');
    setTrackingErrorMessage('');
    setMatchCountdown(5);
    lastScannedOrderRef.current = null;
    setLastScannedOrder(null);
    setScanResult({ type: null, message: '' });
    fetchOrdersRef.current?.(1);
    setTimeout(() => {
      setScannerCode('');
      scanInputRef.current?.focus();
    }, 100);
  };

  const handleVerifyTrackingCode = async (scannedRaw: string) => {
    const scanned = scannedRaw.trim().toUpperCase();
    setScannerCode('');
    if (scanInputRef.current) {
      scanInputRef.current.value = '';
    }
    if (!scanned) return;

    if (trackingMatchStatus === 'matched') return;

    const targetOrderId = completedOrderIdRef.current || completedOrderId || lastScannedOrderRef.current?.id || lastScannedOrder?.id;

    try {
      const res = await api.post('/dispatch/verify', {
        action: 'CONFIRM_DISPATCH_WITH_TRACKING',
        orderId: targetOrderId,
        trackingCode: scanned,
      });

      if (res.data.success) {
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

        // Register all codes of this completed order so any subsequent re-scan is ignored!
        const expTrack = completedTrackingIdRef.current || completedTrackingId || '';
        const expOrd = completedOrderCodeRef.current || completedOrderCode || '';
        const now = Date.now();
        if (expTrack) recentlyCompletedCodesRef.current.set(expTrack, now);
        if (expOrd) recentlyCompletedCodesRef.current.set(expOrd, now);
        if (scanned) recentlyCompletedCodesRef.current.set(scanned, now);
        if (lastScannedOrder?.orderCode) recentlyCompletedCodesRef.current.set(lastScannedOrder.orderCode, now);
        if (lastScannedOrder?.trackingId) recentlyCompletedCodesRef.current.set(lastScannedOrder.trackingId, now);

        // Flush mobile scanner sync queue so duplicate scans of this parcel are flushed
        api.post('/scanner-sync/clear', { session: stationSessionId }).catch(() => {});

        // Remove order from table and update queue stats
        if (targetOrderId) {
          setOrders(prev => prev.filter(o => o.id !== targetOrderId));
          setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
        }

        // V2 Stock Update: Deduct from packagedStock if available, else shelfStock!
        const pCode = lastScannedOrder?.productCode || res.data.data?.order?.productCode;
        if (pCode) {
          api.post('/preparation/dispatch-v2', {
            productCode: pCode,
            quantity: 1,
          }).then(() => {
            fetchPrepSummary();
          }).catch(() => {});
        } else {
          fetchPrepSummary();
        }

        const itemsCount = lastScannedOrder?.totalRequired || 1;
        setQueueStats(prev => ({
          ...prev,
          totalDispatchedCopies: prev.totalDispatchedCopies + itemsCount,
          totalPendingCopies: Math.max(0, prev.totalPendingCopies - itemsCount),
        }));

        if (soundEnabled) {
          playOrderCompleteFanfare();
          speakVoiceAnnouncement('Tracking ID matched successfully! Order fulfilled and stock deducted. Next order, please.');
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
      }
    } catch (err: any) {
      const serverErrMsg = err.response?.data?.message || `Galat Tracking ID "${scanned}". Kripya sahi parcel scan karein.`;
      const expTrack = completedTrackingIdRef.current || completedTrackingId || '';
      const expOrd = completedOrderCodeRef.current || completedOrderCode || '';

      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
      setShowPaytmSuccess(true);
      showPaytmSuccessRef.current = true;
      setTrackingMatchStatus('mismatch');
      setTrackingErrorMessage(serverErrMsg || `Scanned: "${scanned}" | Sahi Tracking ID: "${expTrack || expOrd || 'N/A'}"`);
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

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
      if (matchTimerRef.current) {
        clearInterval(matchTimerRef.current);
      }
    };
  }, []);

  // Auto-focus barcode scanner input perpetually for hands-free scanning
  useEffect(() => {
    const focusTimer = setInterval(() => {
      if (!isDispatchBoxOpen && !showPaytmSuccess) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
          scanInputRef.current?.focus();
        }
      }
    }, 1200);
    return () => clearInterval(focusTimer);
  }, [isDispatchBoxOpen, showPaytmSuccess]);

  const handleGlobalScan = useCallback(async (code: string) => {
    if (!code.trim() || isScanning || isScanningRef.current) return;
    const cleanCode = code.trim().toUpperCase();
    setScannerCode('');
    if (scanInputRef.current) {
      scanInputRef.current.value = '';
    }

    // 1. If currently in 5s celebration countdown after tracking ID match, IGNORE ALL SCANS!
    if (trackingMatchStatus === 'matched') {
      return;
    }

    // 🔒 If Confirmation / Tracking ID overlay is open, ALL scans are for Tracking verification!
    // Never close screen on wrong tracking ID; screen stays open until correct scan!
    if (showPaytmSuccessRef.current) {
      handleVerifyTrackingCode(cleanCode);
      return;
    }

    // Cancel any pending auto-close timers when a new scan starts
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setShowPaytmSuccess(false);

    isScanningRef.current = true;
    setIsScanning(true);
    setScannerCode('');
    setScanResult({ type: null, message: '' });

    try {
      // Check if code matches a book or product in the active loaded order
      const currentOrder = lastScannedOrderRef.current || lastScannedOrder;
      const cleanUpper = cleanCode.replace(/[\s\-_]/g, '').toUpperCase();
      const isCurrentOrderBook = currentOrder && currentOrder.items?.some(
        (i: any) => (i.bookCode && i.bookCode.replace(/[\s\-_]/g, '').toUpperCase() === cleanUpper)
      );
      const isCurrentOrderProduct = currentOrder && (
        (currentOrder.productCode && currentOrder.productCode.replace(/[\s\-_]/g, '').toUpperCase() === cleanUpper) ||
        currentOrder.items?.some((i: any) => i.productCode && i.productCode.replace(/[\s\-_]/g, '').toUpperCase() === cleanUpper)
      );

      // If code starts with ORD-, UNQ-, or is a 9+ digit date code (DDMMYYNNN), or matches an order code or tracking ID, it's a new Order Code scan
      const isNewOrderCode = !isCurrentOrderBook && !isCurrentOrderProduct && (
        cleanCode.startsWith('ORD-') ||
        cleanCode.startsWith('UNQ-') ||
        /^\d{6}\d{3,}$/.test(cleanCode) ||
        orders.some(o => 
          o.orderCode?.toUpperCase() === cleanCode || 
          o.trackingId?.toUpperCase() === cleanCode
        )
      );

      const activeOrderId = !isNewOrderCode && currentOrder?.id && currentOrder.totalPending > 0
        ? currentOrder.id
        : undefined;

      const res = await api.post('/dispatch/verify', {
        enteredCode: cleanCode,
        orderId: activeOrderId,
      });

      if (res.data.success) {
        const data = res.data.data;
        let scanType = '📖 Book Code';
        if (data.scanType === 'ORDER_LOADED') {
          scanType = '🔖 Order Loaded';
        } else if (data.scanType === 'ORDER_CODE') {
          scanType = '🔖 Order Dispatched';
        } else if (data.scanType === 'PRODUCT_CODE') {
          scanType = '📦 Product Verified';
        }

        const updatedOrder = data.order;
        const isComplete = updatedOrder ? updatedOrder.totalPending === 0 : false;
        const isLoadedOnly = data.scanType === 'ORDER_LOADED';

        // Play audio feedback & voice announcement
        if (soundEnabled) {
          if (!isComplete && !isLoadedOnly) {
            playSuccessChime();
          }
        }

        if (updatedOrder) {
          const formattedOrder = {
            id: updatedOrder.id,
            orderCode: updatedOrder.orderCode,
            productCode: updatedOrder.productCode,
            studentName: updatedOrder.studentName,
            mobileNumber: updatedOrder.mobileNumber,
            trackingId: updatedOrder.trackingId,
            status: updatedOrder.status,
            scanType,
            message: data.message,
            itemsDispatched: data.itemsDispatched || 0,
            totalRequired: updatedOrder.totalRequired,
            totalDispatched: updatedOrder.totalDispatched,
            totalPending: updatedOrder.totalPending,
            items: updatedOrder.items || [],
          };

          lastScannedOrderRef.current = formattedOrder;
          setLastScannedOrder(formattedOrder);

          if (isLoadedOnly || data.scanType === 'ORDER_LOADED') {
            if (soundEnabled) {
              playSuccessChime();
              speakVoiceAnnouncement(`New order received. Order for ${updatedOrder.studentName}`);
            }
            setTimeout(() => {
              innerInputRef.current?.focus() || scanInputRef.current?.focus();
            }, 100);
          }

          // Live update orders list in table
          setOrders(prev => prev.map(o => o.id === updatedOrder.id ? {
            ...o,
            totalDispatched: updatedOrder.totalDispatched,
            totalPending: updatedOrder.totalPending,
            status: updatedOrder.status,
            items: updatedOrder.items || o.items,
          } : o));
        }

        const countDispatched = data.itemsDispatched || 0;
        if (countDispatched > 0) {
          setQueueStats(prev => ({
            ...prev,
            totalDispatchedCopies: prev.totalDispatchedCopies + countDispatched,
            totalPendingCopies: Math.max(0, prev.totalPendingCopies - countDispatched),
          }));
        }

        setScanResult({
          type: 'success',
          message: data.notification
            ? `${data.message} Email: ${data.notification.emailDelivery?.sent ? 'sent' : 'not sent'}. WhatsApp: ${data.notification.whatsappDelivery?.sent ? 'sent' : 'not sent'}.`
            : data.message,
          scanType,
          studentName: updatedOrder?.studentName,
          trackingId: updatedOrder?.trackingId,
          itemsDispatched: countDispatched > 0 ? countDispatched : undefined,
        });

        // 🌟 Step 3: Trigger Compulsory Tracking ID Verification
        if ((isComplete || data.allBooksVerified || data.requiresTrackingMatch || data.scanType === 'PRODUCT_CODE') && !isLoadedOnly) {
          setShowPaytmSuccess(true);
          showPaytmSuccessRef.current = true;
          setCompletedOrderId(updatedOrder?.id || activeOrderId || '');
          setCompletedStudentName(updatedOrder?.studentName || '');
          setCompletedTrackingId(updatedOrder?.trackingId || '');
          setCompletedOrderCode(updatedOrder?.orderCode || '');
          setTrackingInput('');
          setTrackingMatchStatus('idle');
          setTrackingErrorMessage('');

          if (soundEnabled) {
            playSuccessChime();
            speakVoiceAnnouncement(`Product verified for ${updatedOrder?.studentName}. Now scan tracking ID to confirm dispatch.`);
          }
        }
      }
    } catch (err: any) {
      const errCode = err.response?.data?.code;
      const serverErrMsg = err.response?.data?.message || `Code "${cleanCode}" could not be verified. Please check barcode.`;

      if (soundEnabled) {
        playErrorTone();
      }

      setScanResult({
        type: 'error',
        message: serverErrMsg,
      });

      // Voice speaks the warning message out loud so operator immediately knows what happened
      if (soundEnabled) {
        if (errCode === 'ORDER_ALREADY_COMPLETED') {
          speakErrorMessage('Warning! Yeh order pehle se hi fully dispatch ho chuka hai.');
        } else if (errCode === 'ORDER_NOT_FOUND') {
          speakErrorMessage('Warning! Galat student code. Order nahi mila.');
        } else if (errCode === 'BOOK_CODE_MISMATCH') {
          speakErrorMessage('Warning! Book code does not match this order.');
        } else if (errCode === 'STUDENT_SCAN_REQUIRED_FIRST') {
          speakErrorMessage('Warning! Pehle Student Barcode scan karein.');
        } else {
          speakErrorMessage(serverErrMsg);
        }
      }

      // Auto-dismiss error alert after 6 seconds so employee screen stays clean
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
      autoCloseTimerRef.current = setTimeout(() => {
        setScanResult({ type: null, message: '' });
      }, 6000);
    } finally {
      setIsScanning(false);
      setScannerCode('');
      // Instantly refocus so employee never touches keyboard or mouse
      setTimeout(() => {
        isScanningRef.current = false;
        scanInputRef.current?.focus();
      }, 150);
    }
  }, [isScanning, soundEnabled, lastScannedOrder]);

  // ─── Mobile Camera Wireless Sync State ─────────────────────────────────────
  const [stationSessionId] = useState<string>(() => {
    const existing = localStorage.getItem('PACKING_STATION_SESSION_ID');
    if (existing) return existing;
    const newId = 'STN-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem('PACKING_STATION_SESSION_ID', newId);
    return newId;
  });
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [connectedPhonesCount, setConnectedPhonesCount] = useState(0);

  // Poll Scans from Connected Mobile Camera every 800ms
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/scanner-sync/poll?session=${stationSessionId}`);
        if (isMounted && res.data && res.data.success) {
          const payload = res.data.data || res.data;
          if (typeof payload.connectedPhones === 'number') {
            setConnectedPhonesCount(payload.connectedPhones);
          }
          const scans: string[] = payload.scans || payload.codes || [];
          for (const code of scans) {
            handleGlobalScan(code);
          }
        }
      } catch (err) {
        // Quiet background polling error
      }
    }, 800);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [stationSessionId, handleGlobalScan]);

  const handleManualFinish = async () => {
    if (!lastScannedOrder?.id || isScanning) return;
    setIsScanning(true);
    try {
      const res = await api.post('/dispatch/verify', {
        action: 'MANUAL_FINISH_ORDER',
        orderId: lastScannedOrder.id,
      });
      if (res.data.success) {
        if (soundEnabled) playSuccessChime();
        const data = res.data.data;
        const updatedOrder = data.order;
        if (updatedOrder) {
          setOrders(prev => prev.map(o => o.id === updatedOrder.id ? {
            ...o,
            totalDispatched: updatedOrder.totalDispatched,
            totalPending: updatedOrder.totalPending,
            status: updatedOrder.status,
            items: updatedOrder.items || o.items,
          } : o));
        }
        setScanResult({
          type: 'success',
          message: data.notification
            ? `${res.data.message} Email: ${data.notification.emailDelivery?.sent ? 'sent' : 'not sent'}. WhatsApp: ${data.notification.whatsappDelivery?.sent ? 'sent' : 'not sent'}.`
            : res.data.message,
          scanType: '📦 Partial Order Finished',
          studentName: updatedOrder?.studentName,
          trackingId: updatedOrder?.trackingId,
        });
        autoCloseTimerRef.current = setTimeout(() => {
          setLastScannedOrder(null);
          setScanResult({ type: null, message: '' });
        }, 2500);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Failed to update order.';
      if (soundEnabled) {
        playErrorTone();
        speakErrorMessage(errMsg);
      }
      setScanResult({
        type: 'error',
        message: errMsg,
      });
    } finally {
      setIsScanning(false);
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  };

  const handleQuickDispatchAll = async () => {
    if (!lastScannedOrder?.id || isScanning) return;
    setIsScanning(true);
    try {
      const res = await api.post('/dispatch/verify', {
        action: 'QUICK_DISPATCH_ALL',
        orderId: lastScannedOrder.id,
      });
      if (res.data.success) {
        if (soundEnabled) playOrderCompleteFanfare();
        const data = res.data.data;
        const updatedOrder = data.order;
        if (updatedOrder) {
          setOrders(prev => prev.map(o => o.id === updatedOrder.id ? {
            ...o,
            totalDispatched: updatedOrder.totalDispatched,
            totalPending: updatedOrder.totalPending,
            status: updatedOrder.status,
            items: updatedOrder.items || o.items,
          } : o));
          setLastScannedOrder((prev: any) => prev ? {
            ...prev,
            totalDispatched: updatedOrder.totalDispatched,
            totalPending: 0,
            status: 'COMPLETED',
            items: updatedOrder.items,
          } : null);
        }
        setScanResult({
          type: 'success',
          message: res.data.message,
          scanType: '⚡ Quick Dispatched',
          studentName: updatedOrder?.studentName,
          trackingId: updatedOrder?.trackingId,
        });

        setShowPaytmSuccess(true);
        showPaytmSuccessRef.current = true;
        setCompletedStudentName(updatedOrder?.studentName || '');
        setCompletedTrackingId(updatedOrder?.trackingId || '');
        setCompletedOrderCode(updatedOrder?.orderCode || '');
        setTrackingInput('');
        setTrackingMatchStatus('idle');
        setTrackingErrorMessage('');
        if (autoCloseTimerRef.current) {
          clearTimeout(autoCloseTimerRef.current);
          autoCloseTimerRef.current = null;
        }
        if (soundEnabled) {
          playOrderCompleteFanfare();
          speakVoiceAnnouncement('Order of upcoming CA is fulfilled at FAST Education. Next order, please.');
        }
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Failed to dispatch all items.';
      if (soundEnabled) {
        playErrorTone();
        speakErrorMessage(errMsg);
      }
      setScanResult({
        type: 'error',
        message: errMsg,
      });
    } finally {
      setIsScanning(false);
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  };

  // Auto-trigger verification as soon as number/code is entered (no Enter click required)
  useEffect(() => {
    const trimmed = scannerCode.trim().toUpperCase();
    if (!trimmed || isScanning || isScanningRef.current) return;

    // 1. Instant trigger if complete Order Code format (ORD-YYMM-NNNNN, UNQ-YYMM-NNNNN, or 9-digit DDMMYYNNN) or matches order
    if (
      /^(ORD|UNQ)-\d{4}-\d{5}$/i.test(trimmed) || 
      /^\d{9}$/.test(trimmed) ||
      orders.some(o => o.orderCode?.toUpperCase() === trimmed || o.trackingId?.toUpperCase() === trimmed)
    ) {
      handleGlobalScan(trimmed);
      return;
    }

    // If user is currently typing an Order Code prefix, DO NOT fire prematurely!
    if (trimmed.startsWith('ORD') || trimmed.startsWith('UNQ')) {
      return;
    }

    // 2. Active Order Context: Check against loaded order's Product Code & Book Codes
    if (lastScannedOrder && lastScannedOrder.totalPending > 0) {
      const activeProdCode = lastScannedOrder.productCode?.toUpperCase();
      const activeBookCodes = (lastScannedOrder.items || []).map((i: any) => i.bookCode?.toUpperCase()).filter(Boolean);

      // A. Instant 0ms trigger if exact match with Product Code or any Book Code
      if (activeProdCode && trimmed === activeProdCode) {
        handleGlobalScan(trimmed);
        return;
      }
      if (activeBookCodes.includes(trimmed)) {
        handleGlobalScan(trimmed);
        return;
      }

      // B. Prefix protection: If user is actively typing a prefix of product code or any book code, DO NOT trigger!
      if (activeProdCode && activeProdCode.startsWith(trimmed)) {
        return;
      }
      if (activeBookCodes.some((bc: string) => bc.startsWith(trimmed))) {
        return;
      }
    }

    // Avoid premature firing for incomplete prefixes
    if (['PRD', 'PRD-', 'BK', 'BK-'].includes(trimmed)) {
      return;
    }

    // 3. Fallback auto-trigger for non-matching codes or external scanner guns (after 800ms typing pause)
    if (trimmed.length >= 5) {
      const timer = setTimeout(() => {
        handleGlobalScan(trimmed);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [scannerCode, isScanning, handleGlobalScan, lastScannedOrder]);

  // Load available Excel batches for filter dropdown
  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const res = await api.get('/imports?limit=30');
        if (res.data.success) {
          setImportBatches(res.data.data.batches || []);
        }
      } catch {
        // Silently ignore if employee has restricted access to imports endpoint
      }
    };
    fetchBatches();
  }, []);

  const fetchOutgoingOrders = async (page = 1, customLimit?: number) => {
    setIsLoading(true);
    try {
      const currentLimit = customLimit || pagination.limit || 10;
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(currentLimit));
      if (search) params.append('search', search);
      if (status !== 'ALL') params.append('status', status);
      if (batchId) params.append('batchId', batchId);
      if (dateFilter) params.append('dateFilter', dateFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await api.get(`/orders/outgoing?${params.toString()}`);
      if (res.data.success) {
        const fetchedOrders: Order[] = res.data.data.orders;
        setOrders(fetchedOrders);
        setPagination(res.data.data.pagination);

        if (res.data.data.stats) {
          setQueueStats(res.data.data.stats);
        } else {
          const reqCount = fetchedOrders.reduce((acc, o) => acc + o.totalRequired, 0);
          const dispCount = fetchedOrders.reduce((acc, o) => acc + o.totalDispatched, 0);
          setQueueStats({
            totalOrders: res.data.data.pagination.total,
            totalRequiredCopies: reqCount,
            totalDispatchedCopies: dispCount,
            totalPendingCopies: Math.max(0, reqCount - dispCount),
          });
        }
      }
    } catch (err) {
      console.error('Failed to load outgoing orders:', err);
    } finally {
      setIsLoading(false);
    }
  };
  fetchOrdersRef.current = fetchOutgoingOrders;

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOutgoingOrders(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, status, batchId, dateFilter, startDate, endDate]);

  const handleOpenDispatchBox = (order: Order) => {
    lastScannedOrderRef.current = order;
    setLastScannedOrder(order);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      innerInputRef.current?.focus() || scanInputRef.current?.focus();
    }, 150);
  };

  const handleCloseDispatchBox = () => {
    setIsDispatchBoxOpen(false);
    setSelectedOrderForDispatch(null);
  };

  const handleOrderUpdated = (updatedOrder: Order) => {
    setOrders((prevOrders) =>
      prevOrders.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
    );
    setSelectedOrderForDispatch(updatedOrder);
    setQueueStats((prev) => ({
      ...prev,
      totalDispatchedCopies: prev.totalDispatchedCopies + 1,
      totalPendingCopies: Math.max(0, prev.totalPendingCopies - 1),
    }));
  };

  const handleMarkEmailSent = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const confirmed = window.confirm(
      `Mark email as sent for ${order.studentName} and remove this order from the outgoing queue?`
    );

    if (!confirmed) return;

    try {
      const res = await api.post(`/orders/${orderId}/mark-email-sent`);
      if (res.data.success) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
        fetchOutgoingOrders(pagination.page);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to mark email as sent.');
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!isAdmin) return;

    const confirmed = window.confirm(
      `Delete the order for ${order.studentName} and its dispatch history? This cannot be undone, and physical dispatch stock will not be restored.`
    );
    if (!confirmed) return;

    setDeletingOrderId(order.id);
    try {
      const res = await api.delete('/orders/bulk-delete', { data: { orderIds: [order.id] } });
      if (res.data.success) {
        if (selectedOrderForDispatch?.id === order.id) handleCloseDispatchBox();
        await fetchOutgoingOrders(pagination.page);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete this order.');
    } finally {
      setDeletingOrderId(null);
    }
  };

  const pendingOrdersList = orders.filter((o) => o.totalPending > 0);
  const currentPendingIndex = selectedOrderForDispatch
    ? pendingOrdersList.findIndex((o) => o.id === selectedOrderForDispatch.id)
    : -1;
  const nextOrder =
    currentPendingIndex >= 0 && currentPendingIndex < pendingOrdersList.length - 1
      ? pendingOrdersList[currentPendingIndex + 1]
      : pendingOrdersList.find((o) => o.id !== selectedOrderForDispatch?.id);

  const handleProceedNextOrder = () => {
    if (nextOrder) {
      setSelectedOrderForDispatch(nextOrder);
    } else {
      handleCloseDispatchBox();
    }
  };

  const baseOrderUrl = isAdmin ? '/admin/orders' : '/employee/orders';

  return (
    <div className="space-y-4">
      {/* ─── Paytm-style Circular Checkmark Success Overlay ─────────── */}
      {showPaytmSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-auto shadow-2xl text-center transform scale-100 transition-all border border-emerald-100 relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Close Button (X) */}
            <button
              onClick={handleDismissSuccessOverlay}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close and scan next"
            >
              <X size={18} />
            </button>

            {/* Paytm Circular Checkmark with Ripple Waves */}
            <div className="relative flex items-center justify-center w-20 h-20 mx-auto mb-3">
              <div className="absolute inset-0 rounded-full bg-emerald-400/25 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-emerald-500/20 animate-pulse" />
              
              <svg className="w-16 h-16 text-emerald-500 relative z-10" viewBox="0 0 52 52">
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
            <div className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full mb-1 border ${
              trackingMatchStatus === 'matched'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}>
              {trackingMatchStatus === 'matched' ? '✓ ORDER FULFILLED & STOCK DEDUCTED' : '⚡ STEP 3: SCAN TRACKING ID (COMPULSORY)'}
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              {completedStudentName ? completedStudentName : 'Order Verification'}
            </h3>
            <p className="text-xs font-medium text-emerald-600 mt-0.5 flex items-center justify-center gap-1.5">
              <span>{trackingMatchStatus === 'matched' ? 'Order Complete & Dispatched' : 'All Books Verified in Package ✅'}</span>
            </p>

            {/* ─── Tracking ID Match Section (Compulsory) ─── */}
            <div className="mt-3 pt-3 border-t border-slate-100 text-left">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5 text-slate-500" />
                  <span>Parcel Tracking ID (अनिवार्य / Compulsory):</span>
                </span>
                {completedTrackingId && (
                  <span className="font-mono text-[11px] font-bold bg-slate-50 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    {completedTrackingId}
                  </span>
                )}
              </div>

              {trackingMatchStatus === 'matched' ? (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Tracking ID Matched Successfully!</span>
                  </div>
                  <div className="text-xs text-emerald-700 font-medium">
                    Parcel verified & confirmed. Order is fully complete.
                  </div>
                  {completedTrackingId && (
                    <div className="font-mono text-xs font-semibold bg-white px-2 py-1 rounded-lg border border-emerald-200 text-emerald-800 inline-block">
                      Tracking ID: {completedTrackingId}
                    </div>
                  )}
                  <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-1.5 pt-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>Next order in <strong className="font-mono text-emerald-800 font-bold">{matchCountdown}s</strong></span>
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
                      className={`w-full px-3 py-2 pr-16 rounded-lg font-mono text-xs font-semibold uppercase tracking-wider transition-all ${
                        trackingMatchStatus === 'mismatch'
                          ? 'bg-rose-50 border border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-200'
                          : 'bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-red-400 focus:ring-2 focus:ring-red-50'
                      }`}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!trackingInput.trim()}
                      className="absolute right-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-md text-[11px] transition-colors cursor-pointer"
                    >
                      Match
                    </button>
                  </div>

                  {trackingMatchStatus === 'mismatch' && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 text-xs font-medium space-y-1">
                      <div className="flex items-center gap-1.5 text-rose-700 font-semibold text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>Galat Tracking ID! / Tracking ID Mismatch</span>
                      </div>
                      <div className="font-mono text-[11px] bg-white px-2 py-1 rounded border border-rose-200 text-rose-800 break-all font-medium">
                        {trackingErrorMessage}
                      </div>
                      <div className="text-[11px] text-rose-600 font-medium pt-0.5">
                        Kripya sahi parcel ka barcode scan karein. Yeh screen sahi barcode scan hone tak khuli rahegi.
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Action buttons footer */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-1.5 text-slate-500">
                {trackingMatchStatus === 'mismatch' ? (
                  <span className="text-rose-600 font-medium flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    <span>Galat Barcode! Sahi scan karein...</span>
                  </span>
                ) : trackingMatchStatus === 'matched' ? (
                  <span className="text-emerald-700 font-medium flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>Next in: <strong className="font-mono text-emerald-800 font-bold">{matchCountdown}s</strong></span>
                  </span>
                ) : (
                  <span className="text-amber-700 text-[11px] font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span>Tracking Scan Required</span>
                  </span>
                )}
              </div>

              {trackingMatchStatus === 'matched' ? (
                <button
                  onClick={handleDismissSuccessOverlay}
                  className="px-3 py-1.5 font-semibold rounded-lg text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <span>Next Order ({matchCountdown}s)</span>
                  <ArrowRight size={12} />
                </button>
              ) : (
                <button
                  onClick={() => setShowPaytmSuccess(false)}
                  className="px-2.5 py-1.5 font-medium rounded-lg text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
                  title="Cancel verification (Stock deduct nahi hoga)"
                >
                  Cancel (Pending)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Compact Global Scanner Bar ───────────────────────────────────────── */}
      <div className={`rounded-lg border p-3 transition-all ${
        scanResult.type === 'success' ? 'border-emerald-300 bg-emerald-50/60' :
        scanResult.type === 'error' ? 'border-rose-300 bg-rose-50/60' :
        'border-slate-200 bg-white'
      }`}>
        {/* Scanner Header Row - compact */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ScanLine size={16} className="text-red-600" />
            <span className="font-semibold text-slate-800 text-sm">Barcode Scanner</span>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 font-medium px-2 py-0.5 rounded-full border border-emerald-200">
              Active
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsMobileModalOpen(true)}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
              title="Connect Mobile Phone Camera as Barcode Scanner"
            >
              <Smartphone size={12} />
              <span className="hidden sm:inline">{stationSessionId}</span>
              {connectedPhonesCount > 0 && (
                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                  {connectedPhonesCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 cursor-pointer"
              title="Toggle Scan Sound Feedback"
            >
              {soundEnabled ? <Volume2 size={12} className="text-emerald-600" /> : <VolumeX size={12} className="text-slate-400" />}
            </button>
          </div>
        </div>
        {/* Scanner Input Row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={scanInputRef}
              type="text"
              value={scannerCode}
              onChange={e => setScannerCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter' && scannerCode.trim()) handleGlobalScan(scannerCode); }}
              placeholder={
                lastScannedOrder && lastScannedOrder.totalPending > 0
                  ? lastScannedOrder.productCode
                    ? `Step 2: Scan Product (${lastScannedOrder.productCode}) or Book Barcodes...`
                    : 'Step 2: Scan the Book Barcode to dispatch...'
                  : "Step 1: Scan Order Barcode (151026001 / ORD-...) to load details..."
              }
              className="w-full px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 bg-white font-medium placeholder:text-slate-400"
              autoFocus
              disabled={isScanning || showPaytmSuccess}
            />
            {scannerCode && (
              <button onClick={() => setScannerCode('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X size={14} className="text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          <button
            onClick={() => handleGlobalScan(scannerCode)}
            disabled={!scannerCode.trim() || isScanning}
            className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Zap size={14} /> {isScanning ? 'Verifying...' : lastScannedOrder && lastScannedOrder.totalPending > 0 ? 'Verify Item' : 'Load Order'}
          </button>
        </div>

        {/* Scan Result Feedback */}
        {scanResult.type && (
          <div className={`mt-2 p-2.5 rounded-lg text-sm font-medium border flex items-start justify-between gap-2 ${
            scanResult.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-start gap-2 flex-1">
              <span className="text-base shrink-0">{scanResult.type === 'success' ? '✅' : '❌'}</span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {scanResult.scanType && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200">
                      {scanResult.scanType}
                    </span>
                  )}
                  <span className="font-medium text-sm">{scanResult.message}</span>
                </div>
                {scanResult.studentName && (
                  <div className="text-xs mt-1 flex flex-wrap gap-3 font-medium">
                    <span>
                      Student:{' '}
                      <strong className="text-sm font-bold">{scanResult.studentName}</strong>
                    </span>
                    {scanResult.trackingId && <span>Tracking: <strong className="font-mono">{scanResult.trackingId}</strong></span>}
                    {scanResult.itemsDispatched !== undefined && <span>Dispatched: <strong>{scanResult.itemsDispatched}</strong></span>}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
                setScanResult({ type: null, message: '' });
              }}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded hover:bg-white/50 transition-colors shrink-0"
              title="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Compact Hint Row */}
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500 font-medium">
          <span className="flex items-center gap-1"><Tag size={11} className="text-slate-400" /> <strong>Step 1</strong>: Order Barcode → load</span>
          <span className="flex items-center gap-1"><Package size={11} className="text-slate-400" /> <strong>Step 2</strong>: Product Barcode → dispatch all</span>
          <span className="flex items-center gap-1"><BookOpen size={11} className="text-slate-400" /> <strong>Alt</strong>: Book Barcode → one-by-one</span>
        </div>

        {/* ─── Order Verification Deck ──── */}
        {lastScannedOrder && (
          <div className="mt-3 bg-white rounded-lg p-4 border border-slate-200 animate-in fade-in duration-200 text-slate-800">
            {/* Top Deck Header */}
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] font-semibold bg-red-600 text-white px-2 py-0.5 rounded">
                  {lastScannedOrder.trackingId}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {lastScannedOrder.studentName}
                </span>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  lastScannedOrder.totalPending === 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {lastScannedOrder.totalPending === 0 ? '✓ Completed' : 'Pending'}
                </span>
              </div>
              <button
                onClick={() => {
                  if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
                  setLastScannedOrder(null);
                  lastScannedOrderRef.current = null;
                  setScanResult({ type: null, message: '' });
                  setTimeout(() => scanInputRef.current?.focus(), 50);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-1 text-xs font-medium"
                title="Close active order & return to search bar"
              >
                <span className="hidden sm:inline">Close</span>
                <X size={14} />
              </button>
            </div>

            {/* 2-COLUMN HORIZONTAL GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              
              {/* ─── LEFT HALF: COURSE, STUDENT DETAILS & SCANNER INPUT ─── */}
              <div className="space-y-3">
                {/* 1. COURSE / PRODUCT HIGHLIGHT CARD */}
                <div className="p-3 rounded-lg bg-red-600 text-white">
                  <div className="space-y-2">
                    {(() => {
                      const productNames = Array.from(new Set(lastScannedOrder.items?.map((i: any) => i.productName).filter(Boolean) || []));
                      if (productNames.length > 0) {
                        return (
                          <div className="text-base sm:text-lg font-bold text-white leading-tight">
                            {productNames.join(' + ')}
                          </div>
                        );
                      }
                      return (
                        <div className="text-base sm:text-lg font-bold text-white leading-tight">
                          {lastScannedOrder.productCode || 'Course Package'}
                        </div>
                      );
                    })()}

                    {/* Book Titles in badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {lastScannedOrder.items?.map((item: any, idx: number) => (
                        <div
                          key={item.id || idx}
                          className="bg-white/15 px-2 py-0.5 rounded border border-white/20 flex items-center gap-1.5 text-xs"
                        >
                          <span className="font-medium text-white">{item.bookName}</span>
                          <span className="font-mono text-[10px] font-semibold bg-white text-red-600 px-1.5 py-0.5 rounded">
                            {item.bookCode}
                          </span>
                          <span className="text-[10px] text-white/80 font-medium">
                            ({item.dispatchedQuantity}/{item.requiredQuantity})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 2. STUDENT DETAILS & COMPACT COUNTERS */}
                <div className="bg-slate-800 text-white rounded-lg p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-700/60">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-medium bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded border border-red-400/30">
                          {lastScannedOrder.trackingId}
                        </span>
                        <h2 className="text-sm font-semibold text-white">
                          {lastScannedOrder.studentName}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <Phone className="w-3 h-3" />
                        <span className="font-mono text-xs">{lastScannedOrder.mobileNumber}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`p-1 rounded text-xs flex items-center gap-1 transition-colors ${
                          soundEnabled ? 'text-red-300 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-700'
                        }`}
                        title={soundEnabled ? 'Sound On' : 'Muted'}
                      >
                        {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                      </button>
                      <Badge status={lastScannedOrder.status} />
                    </div>
                  </div>

                  {/* Real-time Order Quantities - Compact */}
                  <div className="grid grid-cols-3 gap-1.5 pt-2 text-center">
                    <div className="bg-slate-700/60 rounded py-1.5 px-1.5">
                      <span className="text-[9px] text-slate-400 uppercase font-medium tracking-wider block">Required</span>
                      <div className="text-sm font-bold font-mono text-white mt-0.5">{lastScannedOrder.totalRequired}</div>
                    </div>
                    <div className="bg-emerald-900/30 rounded py-1.5 px-1.5">
                      <span className="text-[9px] text-emerald-400 uppercase font-medium tracking-wider block">Done</span>
                      <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                        {lastScannedOrder.totalDispatched}
                        {lastScannedOrder.totalDispatched > 0 && <span className="text-[10px] ml-0.5">✓</span>}
                      </div>
                    </div>
                    <div className={`rounded py-1.5 px-1.5 ${lastScannedOrder.totalPending === 0 ? 'bg-emerald-900/30' : 'bg-amber-900/30'}`}>
                      <span className="text-[9px] text-amber-400 uppercase font-medium tracking-wider block">Left</span>
                      <div className="text-sm font-bold font-mono text-amber-400 mt-0.5">{lastScannedOrder.totalPending}</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium mb-1">
                      <span>Progress</span>
                      <span>{lastScannedOrder.totalRequired > 0 ? Math.round((lastScannedOrder.totalDispatched / lastScannedOrder.totalRequired) * 100) : 0}%</span>
                    </div>
                    <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ease-out ${lastScannedOrder.totalPending === 0 ? 'bg-emerald-400' : 'bg-red-500'}`}
                        style={{ width: `${lastScannedOrder.totalRequired > 0 ? Math.round((lastScannedOrder.totalDispatched / lastScannedOrder.totalRequired) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. SCAN OR TYPE BOOK CODE INPUT */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <form onSubmit={(e) => { e.preventDefault(); if (innerBookCode.trim()) { handleGlobalScan(innerBookCode); setInnerBookCode(''); } }} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="inner-book-code-input"
                        className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1"
                      >
                        <Barcode className="w-3.5 h-3.5 text-red-500" />
                        Scan Book Code
                      </label>
                      {lastScannedOrder.totalPending > 0 && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          {lastScannedOrder.totalPending} left
                        </span>
                      )}
                    </div>

                    <div className="relative flex items-center">
                      <input
                        id="inner-book-code-input"
                        ref={innerInputRef}
                        type="text"
                        value={innerBookCode}
                        onChange={(e) => setInnerBookCode(e.target.value.toUpperCase())}
                        placeholder={
                          lastScannedOrder.totalPending === 0
                            ? 'All books dispatched!'
                            : 'TYPE CODE (E.G. QB101) & PRESS ENTER'
                        }
                        disabled={isScanning || lastScannedOrder.totalPending === 0}
                        className={`w-full pl-3 pr-20 py-2 rounded-lg font-mono font-medium text-sm uppercase tracking-wide transition-all ${
                          lastScannedOrder.totalPending === 0
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            : 'bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-50 focus:border-red-400'
                        }`}
                      />
                      <div className="absolute right-1.5 flex items-center gap-1">
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          disabled={!innerBookCode.trim() || isScanning || lastScannedOrder.totalPending === 0}
                          isLoading={isScanning}
                        >
                          Verify
                        </Button>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 flex items-center justify-between">
                      <span>Barcode gun & keyboard ready</span>
                      <kbd className="bg-white border border-slate-200 rounded px-1 text-[10px] font-mono">Enter ↵</kbd>
                    </p>
                  </form>

                  {/* Quick-fill chips */}
                  {lastScannedOrder.totalPending > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/80 space-y-1.5 text-xs">
                      {/* Product Code chips */}
                      {(() => {
                        const pendingProducts = Array.from(
                          new Set(
                            lastScannedOrder.items
                              .filter((item: any) => (item.requiredQuantity - item.dispatchedQuantity) > 0 && Boolean(item.productCode && item.productCode.trim()))
                              .map((item: any) => (item.productCode || '').trim().toUpperCase())
                          )
                        );
                        if (pendingProducts.length === 0) return null;
                        return (
                          <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-lg bg-purple-50/60 border border-purple-100">
                            <span className="text-purple-700 font-medium text-[11px] mr-0.5">Products:</span>
                            {pendingProducts.map((pCode: any) => (
                              <button
                                key={pCode}
                                type="button"
                                onClick={() => handleGlobalScan(pCode)}
                                className="font-mono text-[11px] font-semibold bg-white text-purple-700 border border-purple-200 hover:bg-purple-50 px-2 py-0.5 rounded transition-all cursor-pointer active:scale-95"
                                title={`Verify Product ${pCode}`}
                              >
                                {pCode}
                              </button>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Individual Book chips */}
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-slate-400 text-[11px]">Expected:</span>
                        {lastScannedOrder.items
                          .filter((item: any) => (item.requiredQuantity - item.dispatchedQuantity) > 0)
                          .map((item: any) => (
                            <button
                              key={item.id || item.bookCode}
                              type="button"
                              onClick={() => handleGlobalScan(item.bookCode)}
                              className="font-mono text-[11px] font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                              title={`Verify ${item.bookCode}`}
                            >
                              {item.bookCode}
                              <span className="text-slate-400 font-normal ml-0.5">({item.requiredQuantity - item.dispatchedQuantity})</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── RIGHT HALF: BOOKS CHECKLIST ─── */}
              <div className="space-y-3">
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 pb-2 mb-2 border-b border-slate-100 font-medium">
                    <span className="flex items-center gap-1">
                      <PackageCheck className="w-3.5 h-3.5 text-red-500" />
                      <span>Books ({lastScannedOrder.items.length} titles)</span>
                    </span>
                    <span className="text-[10px] text-slate-400">Qty</span>
                  </div>

                  <div className="space-y-1.5">
                    {lastScannedOrder.items.map((item: any, idx: number) => {
                      const pendingQty = Math.max(0, item.requiredQuantity - item.dispatchedQuantity);
                      const isItemComplete = pendingQty === 0;

                      return (
                        <div
                          key={item.id || idx}
                          className={`p-2.5 rounded-lg border transition-all ${
                            isItemComplete
                              ? 'bg-emerald-50/50 border-emerald-200'
                              : 'bg-white border-slate-150 hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0 flex-1">
                              {/* Serial Number */}
                              <div
                                className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                                  isItemComplete
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                                }`}
                              >
                                {idx + 1}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1">
                                  <span
                                    className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                                      isItemComplete
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    {item.bookCode}
                                  </span>

                                  {item.productCode && (
                                    <span className="text-[10px] font-mono font-medium bg-purple-50 text-purple-600 px-1 py-0.5 rounded">
                                      {item.productCode}
                                    </span>
                                  )}

                                  <span className="text-xs font-medium text-slate-800 truncate">
                                    {item.bookName}
                                  </span>
                                </div>

                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {item.requiredQuantity > 1 ? `Multi-copy (${item.requiredQuantity})` : 'Single copy'}
                                </div>
                              </div>
                            </div>

                            {/* Quantity & Status */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-mono text-[11px] font-medium text-slate-600">
                                <span className={isItemComplete ? 'text-emerald-600 font-bold' : ''}>
                                  {item.dispatchedQuantity}
                                </span>{' '}
                                / {item.requiredQuantity}
                              </span>

                              {isItemComplete ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Done</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleGlobalScan(item.bookCode)}
                                  className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 cursor-pointer transition-colors"
                                  title={`Verify ${item.bookCode}`}
                                >
                                  Pending
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Manual Finish & Quick Dispatch */}
                  {lastScannedOrder.totalPending > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] text-slate-400">
                        Scan gun / keyboard se book code enter karein.
                      </div>
                      <div className="flex items-center gap-1.5">
                        {lastScannedOrder.totalDispatched > 0 && (
                          <button
                            onClick={handleManualFinish}
                            disabled={isScanning}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1 transition-colors cursor-pointer"
                            title="Dispatch only scanned books"
                          >
                            <CheckCircle2 size={12} />
                            Finish Partial ({lastScannedOrder.totalDispatched}/{lastScannedOrder.totalRequired})
                          </button>
                        )}
                        <button
                          onClick={handleQuickDispatchAll}
                          disabled={isScanning}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-red-600 hover:bg-red-500 text-white flex items-center gap-1 transition-colors cursor-pointer"
                          title="Quick dispatch all remaining"
                        >
                          <Zap size={12} />
                          Quick Dispatch All
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Outgoing Sheet 2
            </h1>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full border border-slate-200">
              V2 Smart Dispatch
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time book verification queue with parcel tracking and shelf stock deduction.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearAllData}
              disabled={isClearing}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              title="Delete all current orders and reset database"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isClearing ? 'Clearing...' : 'Clear All'}
            </button>
            <Link to="/admin/upload-excel">
              <Button variant="primary" size="sm" icon={<Upload className="w-3.5 h-3.5" />}>
                Upload Excel
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* ─── 6 UNIFORM SUMMARY METRIC CARDS ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Parcel Packaging */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider truncate">Parcel Packaging</div>
            <div className="text-lg font-bold text-slate-900 font-mono leading-tight">{prepSummary.packagedStock}</div>
          </div>
        </div>

        {/* Card 2: Shelf Available */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Boxes className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider truncate">Shelf Available</div>
            <div className="text-lg font-bold text-slate-900 font-mono leading-tight">{prepSummary.shelfStock}</div>
          </div>
        </div>

        {/* Card 3: Available Stock */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider truncate">Available Stock</div>
            <div className="text-lg font-bold text-slate-900 font-mono leading-tight">{prepSummary.totalAvailableStock}</div>
          </div>
        </div>

        {/* Card 4: Total Books Required */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider truncate">Books Required</div>
            <div className="text-lg font-bold text-slate-900 font-mono leading-tight">{queueStats.totalRequiredCopies}</div>
          </div>
        </div>

        {/* Card 5: Dispatched Books */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider truncate">Dispatched</div>
            <div className="text-lg font-bold text-emerald-600 font-mono leading-tight">{queueStats.totalDispatchedCopies}</div>
          </div>
        </div>

        {/* Card 6: Pending Books */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider truncate">Pending</div>
            <div className="text-lg font-bold text-amber-600 font-mono leading-tight">{queueStats.totalPendingCopies}</div>
          </div>
        </div>
      </div>

      {/* ─── Unified Filter Toolbar ─── */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, tracking ID, mobile, book code..."
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-50 focus:border-red-400"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Stock History Button */}
            <button
              onClick={() => setShowStockHistory(true)}
              className="inline-flex items-center gap-1 px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              title="Date-wise stock dispatch history"
            >
              <BarChart2 size={13} />
              <span>Stock History</span>
            </button>

            {/* Excel Batch Filter */}
            {importBatches.length > 0 && (
              <select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-600 font-medium focus:outline-none focus:ring-2 focus:ring-red-50 focus:border-red-400 max-w-[180px] truncate"
                title="Filter by uploaded Excel sheet"
              >
                <option value="">All Excel Sheets</option>
                {importBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.originalFileName}
                  </option>
                ))}
              </select>
            )}

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-600 font-medium focus:outline-none focus:ring-2 focus:ring-red-50 focus:border-red-400"
            >
              <option value="ALL">All Active</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIALLY_DISPATCHED">Partial</option>
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
      </div>

      {/* ─── Orders Table ─── */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <LoadingSpinner message="Loading outgoing orders..." />
          </div>
        ) : orders.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No orders found"
              description="All books are dispatched, or no orders match your filters."
              icon={<Truck className="w-6 h-6 text-slate-400" />}
            />
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Student</th>
                    <th className="py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Order Code</th>
                    <th className="py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                    <th className="py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tracking ID</th>
                    <th className="py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Books</th>
                    <th className="py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-center">Req</th>
                    <th className="py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-center">Done</th>
                    <th className="py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-center">Left</th>
                    <th className="py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const isPending = order.totalPending > 0;
                    return (
                      <tr
                        key={order.id}
                        className={`border-b border-slate-50 transition-colors ${
                          isPending ? 'hover:bg-red-50/30' : 'hover:bg-slate-50/50 opacity-80'
                        }`}
                      >
                        {/* Student */}
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800 text-xs">{order.studentName}</div>
                          <div className="text-[10px] font-mono text-slate-400">{order.mobileNumber}</div>
                        </td>

                        {/* Order Code */}
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200" title="Order Barcode">
                            {order.orderCode || 'ORD-GEN'}
                          </span>
                        </td>

                        {/* Product Code */}
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-[11px] font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200" title="Product Barcode">
                            {order.productCode || '-'}
                          </span>
                        </td>

                        {/* Tracking ID */}
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 text-[11px]">
                            {order.trackingId}
                          </span>
                        </td>

                        {/* Books Preview */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {order.items.map((it) => (
                              <span
                                key={it.id}
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium border ${
                                  it.pendingQuantity === 0
                                    ? 'bg-slate-50 text-slate-400 border-slate-100 line-through'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                                title={`${it.bookName} (${it.pendingQuantity} pending)`}
                              >
                                {it.bookCode}
                                {it.requiredQuantity > 1 ? ` ×${it.requiredQuantity}` : ''}
                                {it.pendingQuantity > 0 && it.dispatchedQuantity > 0 ? ` (${it.pendingQuantity})` : ''}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Counts */}
                        <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-600 text-xs">
                          {order.totalRequired}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-semibold text-emerald-600 text-xs">
                          {order.totalDispatched}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-semibold text-amber-600 text-xs">
                          {order.totalPending}
                        </td>

                        {/* Status Badge */}
                        <td className="py-2.5 px-3">
                          <Badge status={order.status} />
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handleMarkEmailSent(order.id)}
                              icon={<Mail className="w-3 h-3" />}
                            >
                              <span className="hidden sm:inline">Email</span>
                            </Button>

                            <Button
                              variant={isPending ? 'primary' : 'outline'}
                              size="sm"
                              onClick={() => handleOpenDispatchBox(order)}
                              icon={<PackageOpen className="w-3 h-3" />}
                            >
                              <span className="hidden sm:inline">{isPending ? 'Dispatch' : 'View'}</span>
                            </Button>

                            <Link to={`${baseOrderUrl}/${order.id}`} title="View Details">
                              <button className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition-colors">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            </Link>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteOrder(order)}
                                disabled={deletingOrderId === order.id}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-50"
                                title="Delete order"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t border-slate-100">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                totalRecords={pagination.total}
                pageSize={pagination.limit}
                onPageChange={(p) => fetchOutgoingOrders(p)}
                onPageSizeChange={(newLimit) => {
                  setPagination(prev => ({ ...prev, limit: newLimit }));
                  fetchOutgoingOrders(1, newLimit);
                }}
                pageSizeOptions={[10, 25, 50, 100]}
                maxCustomLimit={100}
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── MOBILE CAMERA SCANNER PAIRING MODAL ───────────────────────── */}
      {isMobileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 text-center relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsMobileModalOpen(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 mx-auto flex items-center justify-center mb-2.5">
              <Smartphone size={22} />
            </div>

            <h3 className="text-lg font-bold text-slate-900">
              Connect Mobile Camera
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
              Scan this QR code with your phone camera to use it as a wireless barcode scanner.
            </p>

            {/* QR Code */}
            <div className="my-4 p-3 bg-white border border-dashed border-slate-200 rounded-xl inline-block">
              <QRCodeSVG
                value={`${window.location.origin}/mobile-scanner?session=${stationSessionId}`}
                size={180}
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-left text-xs space-y-1.5">
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-medium">Station:</span>
                <span className="font-mono font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                  {stationSessionId}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-medium">Status:</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  {connectedPhonesCount > 0 ? `${connectedPhonesCount} Connected` : 'Listening'}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[10px] text-slate-400 text-left">
                No app required. Runs in browser.
              </p>
              <button
                onClick={() => setIsMobileModalOpen(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISPATCH BOX MODAL */}
      <DispatchBoxModal
        isOpen={isDispatchBoxOpen}
        onClose={handleCloseDispatchBox}
        order={selectedOrderForDispatch}
        onOrderUpdated={handleOrderUpdated}
        onProceedNextOrder={handleProceedNextOrder}
        hasNextOrder={!!nextOrder}
      />

      {/* ─── Stock Dispatch History Modal ─── */}
      <StockDispatchHistoryModal
        isOpen={showStockHistory}
        onClose={() => setShowStockHistory(false)}
      />
    </div>
  );
};
