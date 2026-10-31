import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Order, ImportBatch } from '../../types';
import { Card } from '../../components/common/Card';
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
  FileSpreadsheet,
  PackageOpen,
  CheckCircle2,
  Clock,
  Sparkles,
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
  QrCode,
  Mail,
  BarChart2,
  PackageCheck,
  Barcode,
  Phone,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { playSuccessChime, playErrorTone, playOrderCompleteFanfare, speakVoiceAnnouncement, speakVoiceTwice, speakErrorMessage } from '../../utils/sound';

export const OutgoingOrdersPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);

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
  const [completedStudentName, setCompletedStudentName] = useState('');
  const [successCountdown, setSuccessCountdown] = useState(15);
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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setShowPaytmSuccess(false);
    lastScannedOrderRef.current = null;
    setLastScannedOrder(null);
    setScanResult({ type: null, message: '' });
    fetchOrdersRef.current?.(1);
  };

  // Decrement success overlay countdown every second (15s down to 0)
  useEffect(() => {
    if (!showPaytmSuccess) return;
    const interval = setInterval(() => {
      setSuccessCountdown((prev) => {
        if (prev <= 1) {
          handleDismissSuccessOverlay();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showPaytmSuccess]);

  // Clear auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, []);

  // Auto-focus barcode scanner input perpetually for hands-free scanning
  useEffect(() => {
    const focusTimer = setInterval(() => {
      if (!isDispatchBoxOpen) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
          scanInputRef.current?.focus();
        }
      }
    }, 1200);
    return () => clearInterval(focusTimer);
  }, [isDispatchBoxOpen]);

  const handleGlobalScan = useCallback(async (code: string) => {
    if (!code.trim() || isScanning || isScanningRef.current) return;
    const cleanCode = code.trim().toUpperCase();

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

        // 🌟 Confirmation Box: Stays on screen for 15 seconds while voice announces 2 times!
        if (isComplete && !isLoadedOnly) {
          setShowPaytmSuccess(true);
          setCompletedStudentName(updatedOrder?.studentName || '');
          setSuccessCountdown(15);
          setOrders(prev => prev.filter(o => o.id !== updatedOrder.id));
          setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));

          if (soundEnabled) {
            playOrderCompleteFanfare();
            speakVoiceTwice('Order of upcoming CA is fulfilled at FAST Education. Next order, please.');
          }

          // Full 15 seconds duration as requested
          autoCloseTimerRef.current = setTimeout(() => {
            handleDismissSuccessOverlay();
          }, 15000);
        }
      }
    } catch (err: any) {
      if (soundEnabled) playErrorTone();
      const serverErrMsg = err.response?.data?.message || `Code "${cleanCode}" could not be verified or has no pending books.`;
      setScanResult({
        type: 'error',
        message: serverErrMsg,
      });

      // Voice speaks the error message out loud so operator immediately knows what happened
      if (soundEnabled) {
        speakErrorMessage(serverErrMsg);
      }

      // Auto-dismiss error alert after 5 seconds so employee screen stays clean
      autoCloseTimerRef.current = setTimeout(() => {
        setScanResult({ type: null, message: '' });
      }, 5000);
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
            setScannerCode(code);
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
        setCompletedStudentName(updatedOrder?.studentName || '');
        setSuccessCountdown(15);
        if (soundEnabled) {
          playOrderCompleteFanfare();
          speakVoiceTwice('Order of upcoming CA is fulfilled at FAST Education. Next order, please.');
        }
        autoCloseTimerRef.current = setTimeout(() => {
          handleDismissSuccessOverlay();
        }, 15000);
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
    <div className="space-y-6">
      {/* ─── Paytm-style Circular Checkmark Success Overlay ─────────── */}
      {showPaytmSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200 p-4">
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
            <div className="inline-block bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full mb-2 border border-emerald-200">
              ✓ ORDER VERIFIED & DISPATCHED
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
              {completedStudentName ? completedStudentName : 'Order Completed!'}
            </h3>
            <p className="text-sm font-semibold text-emerald-600 mt-1 flex items-center justify-center gap-1.5">
              <span>All Books Verified & Done</span>
            </p>
            
            <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span>Next in: <strong className="font-mono text-emerald-700 font-bold">{successCountdown}s</strong></span>
              </div>

              <button
                onClick={handleDismissSuccessOverlay}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <span>अगला आर्डर</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Global Scanner Box ───────────────────────────────────────────────── */}
      <div className={`rounded-xl border-2 p-4 transition-all shadow-xs ${
        scanResult.type === 'success' ? 'border-emerald-400 bg-emerald-50/70' :
        scanResult.type === 'error' ? 'border-rose-400 bg-rose-50/70' :
        'border-red-300 bg-red-50/60'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ScanLine size={20} className="text-red-600 animate-pulse" />
            <span className="font-bold text-red-950 text-sm">3-Tier Global Barcode Scanner Station</span>
            <span className="text-xs text-red-700 bg-red-100 font-semibold px-2.5 py-0.5 rounded-full border border-red-200">
              Hands-Free Continuous Scanning Active
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileModalOpen(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-xs transition-colors cursor-pointer"
              title="Connect Mobile Phone Camera as Barcode Scanner"
            >
              <Smartphone size={14} />
              <span>📱 Connect Mobile Camera ({stationSessionId})</span>
              {connectedPhonesCount > 0 && (
                <span className="ml-1 bg-emerald-400 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {connectedPhonesCount} Connected
                </span>
              )}
            </button>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-white border border-red-200 rounded-lg text-red-700 hover:bg-red-50 shadow-2xs cursor-pointer"
              title="Toggle Scan Sound Feedback"
            >
              {soundEnabled ? <Volume2 size={14} className="text-emerald-600" /> : <VolumeX size={14} className="text-slate-400" />}
              <span>{soundEnabled ? 'Chime ON' : 'Muted'}</span>
            </button>
          </div>
        </div>
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
                    ? `⚡ Step 2: Scan Product Barcode (${lastScannedOrder.productCode}) or individual Book Barcodes...`
                    : '⚡ Step 2: Scan the individual Book Barcode to dispatch this order...'
                  : "⚡ Step 1: Aim scanner at Student Order Barcode (151026001 / ORD-...) to load details..."
              }
              className="w-full px-4 py-3.5 text-sm font-mono border-2 border-red-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-600 bg-white shadow-xs font-bold"
              autoFocus
              disabled={isScanning}
            />
            {scannerCode && (
              <button onClick={() => setScannerCode('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={16} className="text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          <button
            onClick={() => handleGlobalScan(scannerCode)}
            disabled={!scannerCode.trim() || isScanning}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-semibold flex items-center gap-2 shrink-0 shadow-xs cursor-pointer"
          >
            <Zap size={16} /> {isScanning ? 'Verifying...' : lastScannedOrder && lastScannedOrder.totalPending > 0 ? 'Verify Item' : 'Load Order'}
          </button>
        </div>

        {/* Scan Result Feedback */}
        {scanResult.type && (
          <div className={`mt-3 p-3.5 rounded-lg text-sm font-medium border flex items-start justify-between gap-3 ${
            scanResult.type === 'success' ? 'bg-emerald-100/90 border-emerald-300 text-emerald-950' : 'bg-rose-100/90 border-rose-300 text-rose-950'
          }`}>
            <div className="flex items-start gap-3 flex-1">
              <span className="text-xl shrink-0 mt-0.5">{scanResult.type === 'success' ? '✅' : '❌'}</span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {scanResult.scanType && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-white border border-current shadow-2xs">
                      {scanResult.scanType}
                    </span>
                  )}
                  <span className="font-semibold">{scanResult.message}</span>
                </div>
                {scanResult.studentName && (
                  <div className="text-xs mt-1.5 flex flex-wrap gap-4 text-emerald-900 font-medium">
                    <span>
                      Student:{' '}
                      <strong className="text-base sm:text-lg font-black">{scanResult.studentName}</strong>
                    </span>
                    {scanResult.trackingId && <span>Tracking ID: <strong className="font-mono">{scanResult.trackingId}</strong></span>}
                    {scanResult.itemsDispatched !== undefined && <span>Copies Dispatched: <strong>{scanResult.itemsDispatched}</strong></span>}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
                setScanResult({ type: null, message: '' });
              }}
              className="text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-white/50 transition-colors shrink-0"
              title="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Hint */}
        <div className="mt-2.5 flex flex-wrap gap-4 text-xs text-red-700 font-medium">
          <span className="flex items-center gap-1"><Tag size={13} className="text-emerald-700" /> <strong>Step 1</strong>: Scan <strong>Order Barcode (151026001 / ORD-...)</strong> to load order</span>
          <span className="flex items-center gap-1"><Package size={13} className="text-purple-700" /> <strong>Step 2 (Combo)</strong>: Scan <strong>Product Barcode</strong> to tick & dispatch all books</span>
          <span className="flex items-center gap-1"><BookOpen size={13} className="text-red-700" /> <strong>Step 2 (Single)</strong>: Scan individual <strong>Book Barcodes</strong> to tick one-by-one</span>
        </div>

        {/* ─── 2-COLUMN ORDER VERIFICATION DECK (Image 2 clean layout under scanner bar) ──── */}
        {lastScannedOrder && (
          <div className="mt-4 bg-white rounded-2xl p-4 sm:p-5 shadow-xl border-2 border-red-200 animate-in fade-in duration-200 text-slate-800">
            {/* Top Deck Header: Close Button and Order Title */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold bg-red-600 text-white px-2.5 py-1 rounded">
                  {lastScannedOrder.trackingId}
                </span>
                <span className="text-base sm:text-lg font-black text-slate-900">
                  {lastScannedOrder.studentName}
                </span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  lastScannedOrder.totalPending === 0
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}>
                  {lastScannedOrder.totalPending === 0 ? '✓ Order Completed' : 'Pending Verification'}
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
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
                title="Close active order & return to search bar"
              >
                <span>Close</span>
                <X size={16} />
              </button>
            </div>

            {/* 2-COLUMN HORIZONTAL GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              
              {/* ─── LEFT HALF: COURSE, STUDENT DETAILS & SCANNER INPUT ─── */}
              <div className="space-y-3.5">
                {/* 1. COURSE / PRODUCT HIGHLIGHT CARD */}
                <div className="p-3.5 rounded-2xl bg-[#DE3744] text-white shadow-lg border-2 border-[#ff838c]/40 ring-2 ring-[#DE3744]/20">
                  <div className="space-y-2">
                    {(() => {
                      const productNames = Array.from(new Set(lastScannedOrder.items?.map((i: any) => i.productName).filter(Boolean) || []));
                      if (productNames.length > 0) {
                        return (
                          <div className="text-xl sm:text-2xl font-black text-white tracking-wide leading-tight drop-shadow-md">
                            📦 {productNames.join(' + ')}
                          </div>
                        );
                      }
                      return (
                        <div className="text-xl sm:text-2xl font-black text-white tracking-wide leading-tight drop-shadow-md">
                          📦 {lastScannedOrder.productCode || 'Course Package'}
                        </div>
                      );
                    })()}

                    {/* Book Titles in badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {lastScannedOrder.items?.map((item: any, idx: number) => (
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

                {/* 2. STUDENT DETAILS & COMPACT COUNTERS CARD */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-3.5 shadow-md border border-slate-700/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-slate-700/80">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold bg-red-500/20 text-red-300 px-2 py-0.5 rounded border border-red-400/30">
                          {lastScannedOrder.trackingId}
                        </span>
                        <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                          {lastScannedOrder.studentName}
                        </h2>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 mt-1">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <strong className="font-mono">{lastScannedOrder.mobileNumber}</strong>
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
                      <Badge status={lastScannedOrder.status} />
                    </div>
                  </div>

                  {/* Real-time Order Quantities Bar - Compact Size */}
                  <div className="grid grid-cols-3 gap-1.5 pt-2 text-center">
                    <div className="bg-slate-800/80 rounded-lg py-1.5 px-2 border border-slate-700/50">
                      <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider block">
                        Total Required
                      </span>
                      <div className="text-sm sm:text-base font-bold font-mono text-white mt-0.5">
                        {lastScannedOrder.totalRequired}
                      </div>
                    </div>

                    <div className="bg-emerald-950/30 rounded-lg py-1.5 px-2 border border-emerald-800/40">
                      <span className="text-[9px] text-emerald-400 uppercase font-semibold tracking-wider block">
                        Dispatched
                      </span>
                      <div className="text-sm sm:text-base font-bold font-mono text-emerald-400 mt-0.5 flex items-center justify-center gap-1">
                        <span>{lastScannedOrder.totalDispatched}</span>
                        {lastScannedOrder.totalDispatched > 0 && <span className="text-xs">✓</span>}
                      </div>
                    </div>

                    <div className={`rounded-lg py-1.5 px-2 border ${
                      lastScannedOrder.totalPending === 0
                        ? 'bg-emerald-900/40 border-emerald-600/50'
                        : 'bg-amber-950/30 border-amber-800/40'
                    }`}>
                      <span className="text-[9px] text-amber-400 uppercase font-semibold tracking-wider block">
                        Remaining
                      </span>
                      <div className="text-sm sm:text-base font-bold font-mono text-amber-400 mt-0.5">
                        {lastScannedOrder.totalPending}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2.5">
                    <div className="flex justify-between items-center text-[10px] text-slate-300 font-medium mb-1">
                      <span>Student Dispatch Progress</span>
                      <span>
                        {lastScannedOrder.totalRequired > 0 ? Math.round((lastScannedOrder.totalDispatched / lastScannedOrder.totalRequired) * 100) : 0}% ({lastScannedOrder.totalDispatched} of {lastScannedOrder.totalRequired} books)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ease-out ${
                          lastScannedOrder.totalPending === 0 ? 'bg-emerald-400' : 'bg-red-500'
                        }`}
                        style={{
                          width: `${lastScannedOrder.totalRequired > 0 ? Math.round((lastScannedOrder.totalDispatched / lastScannedOrder.totalRequired) * 100) : 0}%`
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. SCAN OR TYPE PHYSICAL BOOK CODE INPUT (Under Student Card) */}
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 shadow-inner">
                  <form onSubmit={(e) => { e.preventDefault(); if (innerBookCode.trim()) { handleGlobalScan(innerBookCode); setInnerBookCode(''); } }} className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="inner-book-code-input"
                        className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <Barcode className="w-4 h-4 text-red-600" />
                        Scan or Type Physical Book Code
                      </label>
                      {lastScannedOrder.totalPending > 0 && (
                        <span className="text-[11px] text-slate-500 font-medium">
                          {lastScannedOrder.totalPending} book{lastScannedOrder.totalPending > 1 ? 's' : ''} left
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
                            ? 'All books for this order have been dispatched!'
                            : 'TYPE BOOK CODE (E.G. QB101) & PRESS ENTER'
                        }
                        disabled={isScanning || lastScannedOrder.totalPending === 0}
                        className={`w-full pl-4 pr-24 py-2.5 rounded-xl font-mono font-bold text-sm sm:text-base uppercase tracking-wide transition-all ${
                          lastScannedOrder.totalPending === 0
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            : 'bg-white border-2 border-red-500/70 text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-red-100 focus:border-red-600'
                        }`}
                      />

                      <div className="absolute right-2 flex items-center gap-1.5">
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

                    <p className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>Physical barcode gun scanner & keyboard ready.</span>
                      <span>Press <kbd className="bg-white border border-slate-300 rounded px-1 text-[10px] font-mono">Enter ↵</kbd></span>
                    </p>
                  </form>

                  {/* Quick-fill chips for pending products & books */}
                  {lastScannedOrder.totalPending > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-2 text-xs">
                      {/* Product Code chips if order contains multiple products */}
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
                          <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-purple-50/80 border border-purple-200">
                            <span className="text-purple-800 font-bold text-[11px] mr-1 flex items-center gap-1">
                              <span>📦 Products ({pendingProducts.length}):</span>
                            </span>
                            {pendingProducts.map((pCode: any) => (
                              <button
                                key={pCode}
                                type="button"
                                onClick={() => handleGlobalScan(pCode)}
                                className="font-mono text-[11px] font-black bg-white text-purple-800 border-2 border-purple-300 hover:bg-purple-100 hover:border-purple-500 px-2.5 py-0.5 rounded-lg transition-all flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                                title={`Click to verify Product Code ${pCode}`}
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
                        {lastScannedOrder.items
                          .filter((item: any) => (item.requiredQuantity - item.dispatchedQuantity) > 0)
                          .map((item: any) => (
                            <button
                              key={item.id || item.bookCode}
                              type="button"
                              onClick={() => handleGlobalScan(item.bookCode)}
                              className="font-mono text-[11px] font-bold bg-white text-red-700 border border-red-200 hover:bg-red-50 hover:border-red-400 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                              title={`Click to verify ${item.bookCode}`}
                            >
                              <span>{item.bookCode}</span>
                              <span className="text-slate-400 font-normal">({item.requiredQuantity - item.dispatchedQuantity})</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── RIGHT HALF: BOOKS CHECKLIST FOR THIS STUDENT ─── */}
              <div className="space-y-3">
                <div className="bg-white border-2 border-slate-200/90 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-slate-700 pb-2.5 mb-2.5 border-b border-slate-100 font-bold">
                    <span className="flex items-center gap-1.5">
                      <PackageCheck className="w-4 h-4 text-[#DE3744]" />
                      <span>Books In This Order ({lastScannedOrder.items.length} titles)</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">Quantity Breakdown</span>
                  </div>

                  <div className="space-y-2">
                    {lastScannedOrder.items.map((item: any, idx: number) => {
                      const pendingQty = Math.max(0, item.requiredQuantity - item.dispatchedQuantity);
                      const isItemComplete = pendingQty === 0;

                      return (
                        <div
                          key={item.id || idx}
                          className={`p-3 rounded-xl border transition-all ${
                            isItemComplete
                              ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              {/* Serial Number Badge */}
                              <div
                                className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 mt-0.5 ${
                                  isItemComplete
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-red-50 text-red-600 border border-red-200'
                                }`}
                              >
                                {idx + 1}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`font-mono text-xs font-black px-2 py-0.5 rounded border ${
                                      isItemComplete
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : 'bg-slate-100 text-slate-800 border-slate-300'
                                    }`}
                                  >
                                    {item.bookCode}
                                  </span>

                                  {item.productCode && (
                                    <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 flex items-center gap-0.5">
                                      <span>📦 {item.productCode}</span>
                                    </span>
                                  )}

                                  <span className="text-xs font-bold text-slate-900 truncate">
                                    {item.bookName}
                                  </span>
                                </div>

                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  {item.requiredQuantity > 1 ? `Multi-copy order (${item.requiredQuantity} copies)` : 'Single copy order'}
                                </div>
                              </div>
                            </div>

                            {/* Quantity Counter & Status Badge */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-xs font-bold text-slate-700">
                                <span className={isItemComplete ? 'text-emerald-700 font-black' : 'text-slate-900'}>
                                  {item.dispatchedQuantity}
                                </span>{' '}
                                / {item.requiredQuantity}
                              </span>

                              {isItemComplete ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Dispatched</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleGlobalScan(item.bookCode)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 cursor-pointer transition-colors"
                                  title={`Click to verify ${item.bookCode}`}
                                >
                                  <span>Pending</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Manual Finish & Quick Dispatch Actions */}
                  {lastScannedOrder.totalPending > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500">
                        ⚡ Scan gun ya keyboard se book code enter karein.
                      </div>
                      <div className="flex items-center gap-2">
                        {lastScannedOrder.totalDispatched > 0 && (
                          <button
                            onClick={handleManualFinish}
                            disabled={isScanning}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                            title="Dispatch only scanned books, keep remaining as Pending"
                          >
                            <CheckCircle2 size={13} />
                            Finish Partial Order ({lastScannedOrder.totalDispatched}/{lastScannedOrder.totalRequired})
                          </button>
                        )}
                        <button
                          onClick={handleQuickDispatchAll}
                          disabled={isScanning}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                          title="Quickly dispatch all remaining books for this order without scanning"
                        >
                          <Zap size={13} />
                          Quick Dispatch All Books
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Outgoing Sheet
            </h1>
            <span className="text-xs bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full border border-red-200">
              Active Dispatch Station
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time book verification queue: click any order to open its Dispatch Box & scan books one by one.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearAllData}
              disabled={isClearing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              title="Delete all current orders and reset database"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isClearing ? 'Clearing...' : 'Clear All Orders'}
            </button>
            <Link to="/admin/upload-excel">
              <Button variant="primary" size="sm" icon={<Upload className="w-4 h-4" />}>
                Upload New Excel Sheet
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Top Real-time Queue Statistics Cards ("total count mese ek kam hoge") */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Orders In Queue
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono mt-0.5">
              {pagination.total}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Books Required
            </div>
            <div className="text-2xl font-black text-slate-800 font-mono mt-0.5">
              {queueStats.totalRequiredCopies}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
              Dispatched Books
            </div>
            <div className="text-2xl font-black text-emerald-600 font-mono mt-0.5">
              {queueStats.totalDispatchedCopies}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4.5 border border-amber-200/80 bg-amber-50/20 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">
              Pending Books Remaining
            </div>
            <div className="text-2xl font-black text-amber-600 font-mono mt-0.5">
              {queueStats.totalPendingCopies}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, tracking ID, mobile, book code..."
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          {/* 📊 Stock History Button */}
          <button
            onClick={() => setShowStockHistory(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-sm whitespace-nowrap"
            title="Date-wise stock dispatch history — kitni thi, kitni gayi, kitni bachi"
          >
            <BarChart2 size={14} />
            <span>📊 Stock History</span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter by Excel Batch ("jo exel upload kare vo outgoing sheet me bhi dekhna chahiye") */}
            {importBatches.length > 0 && (
              <select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-red-600 max-w-[200px] truncate"
                title="Filter by uploaded Excel sheet"
              >
                <option value="">All Uploaded Excel Sheets</option>
                {importBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    📄 {b.originalFileName}
                  </option>
                ))}
              </select>
            )}

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              <option value="ALL">All Active (Pending & Partial)</option>
              <option value="PENDING">Pending Only</option>
              <option value="PARTIALLY_DISPATCHED">Partially Dispatched</option>
              <option value="COMPLETED">Completed Orders</option>
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

      {/* Outgoing Orders Table */}
      <Card>
        {isLoading ? (
          <LoadingSpinner message="Loading outgoing orders sheet..." />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders found in outgoing sheet"
            description="Either all books are already dispatched, or no orders match your search filters."
            icon={<Truck className="w-8 h-8 text-slate-400" />}
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
                    <th className="py-3 px-4 text-right">Dispatch Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => {
                    const isPending = order.totalPending > 0;
                    return (
                      <tr
                        key={order.id}
                        className={`transition-colors ${
                          isPending ? 'hover:bg-red-50/40' : 'hover:bg-slate-50/60 opacity-85'
                        }`}
                      >
                        {/* Student Name & Mobile */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{order.studentName}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {order.mobileNumber}
                          </div>
                        </td>

                        {/* Order Unique Code */}
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-300 inline-flex items-center gap-1 shadow-2xs" title="Order Unique Barcode (Tier 1)">
                            🔖 {order.orderCode || 'ORD-GEN'}
                          </span>
                        </td>

                        {/* Product Code */}
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded border border-purple-300 inline-flex items-center gap-1 shadow-2xs" title="Product Combo Barcode (Tier 2)">
                            📦 {order.productCode || '-'}
                          </span>
                        </td>

                        {/* Tracking ID */}
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 text-xs inline-block">
                            {order.trackingId}
                          </span>
                        </td>

                        {/* Books Preview Pills */}
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1.5 max-w-sm">
                            {order.items.map((it) => (
                              <span
                                key={it.id}
                                className={`text-[11px] font-mono px-2 py-1 rounded font-semibold border flex items-center gap-1 shadow-2xs ${
                                  it.pendingQuantity === 0
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                                    : 'bg-amber-50 text-amber-900 border-amber-300'
                                }`}
                                title={`${it.bookName} (${it.pendingQuantity} pending)`}
                              >
                                📖 {it.bookCode}
                                {it.requiredQuantity > 1 ? ` ×${it.requiredQuantity}` : ''}
                                {it.pendingQuantity > 0 && it.dispatchedQuantity > 0 ? ` (${it.pendingQuantity} left)` : ''}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Total Counts */}
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                          {order.totalRequired}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600">
                          {order.totalDispatched}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-amber-600">
                          {order.totalPending}
                        </td>

                        {/* Order Status */}
                        <td className="py-3 px-4">
                          <Badge status={order.status} />
                        </td>

                        {/* Action: Open Dispatch Box / Details ("har order ke samne click karne par vha ek box open ho") */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handleMarkEmailSent(order.id)}
                              icon={<Mail className="w-3.5 h-3.5" />}
                            >
                              Email Sent
                            </Button>

                            <Button
                              variant={isPending ? 'primary' : 'outline'}
                              size="sm"
                              onClick={() => handleOpenDispatchBox(order)}
                              icon={<PackageOpen className="w-3.5 h-3.5" />}
                            >
                              {isPending ? 'Dispatch Box' : 'View Box'}
                            </Button>

                            <Link to={`${baseOrderUrl}/${order.id}`} title="View Full Order Details">
                              <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            </Link>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteOrder(order)}
                                disabled={deletingOrderId === order.id}
                                className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 rounded-lg border border-rose-200 transition-colors disabled:opacity-50"
                                title="Delete this order"
                                aria-label={`Delete order for ${order.studentName}`}
                              >
                                <Trash2 className="w-4 h-4" />
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
        )}
      </Card>

      {/* ─── MOBILE CAMERA SCANNER PAIRING MODAL ───────────────────────── */}
      {isMobileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsMobileModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 mx-auto flex items-center justify-center mb-3 shadow-inner">
              <Smartphone size={28} />
            </div>

            <h3 className="text-xl font-bold text-slate-900 tracking-tight">
              Connect Mobile Phone Camera
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Open your phone's normal camera and scan this QR code. Your mobile will turn into a high-speed wireless barcode scanner!
            </p>

            {/* QR Code Canvas */}
            <div className="my-5 p-4 bg-white border-2 border-dashed border-red-200 rounded-2xl inline-block shadow-xs">
              <QRCodeSVG
                value={`${window.location.origin}/mobile-scanner?session=${stationSessionId}`}
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-left text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-semibold text-slate-600">Station Code:</span>
                <span className="font-mono font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  {stationSessionId}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-semibold text-slate-600">Sync Status:</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  {connectedPhonesCount > 0 ? `${connectedPhonesCount} Mobile Connected` : 'Ready & Listening'}
                </span>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[11px] text-slate-400 text-left">
                No app installation required. Runs directly in browser!
              </p>
              <button
                onClick={() => setIsMobileModalOpen(false)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
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
