import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LoginPage } from './pages/LoginPage';

// Admin Pages
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { ExcelUploadPage } from './pages/admin/ExcelUploadPage';
import { ImportHistoryPage } from './pages/admin/ImportHistoryPage';
import { AllOrdersPage } from './pages/admin/AllOrdersPage';
import { DispatchHistoryPage } from './pages/admin/DispatchHistoryPage';
import { FailedAttemptsPage } from './pages/admin/FailedAttemptsPage';
import { BookSummaryPage } from './pages/admin/BookSummaryPage';
import { EmployeesPage } from './pages/admin/EmployeesPage';
import { ReportsPage } from './pages/admin/ReportsPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { BarcodeSheetPage } from './pages/BarcodeSheetPage';
import { BarcodeCatalogPage } from './pages/BarcodeCatalogPage';
import { InvertStockPage } from './pages/stock/InvertStockPage';
import { AvailableStockPage } from './pages/stock/AvailableStockPage';
import { PendingStockPage } from './pages/stock/PendingStockPage';

// Common Pages
import { OutgoingOrdersPage } from './pages/common/OutgoingOrdersPage';
import { OutgoingOrdersPage2 } from './pages/common/OutgoingOrdersPage2';
import { PreparationPage } from './pages/preparation/PreparationPage';
import { OrderDetailPage } from './pages/common/OrderDetailPage';
import { MobileScannerPage } from './pages/MobileScannerPage';

// Employee Pages
import { EmployeeDashboardPage } from './pages/employee/EmployeeDashboardPage';
import { EmployeeMyHistoryPage } from './pages/employee/EmployeeMyHistoryPage';

// Route Guards
const ProtectedRoute: React.FC<{
  allowedRoles: ('ADMIN' | 'EMPLOYEE')[];
  children: React.ReactNode;
}> = ({ allowedRoles, children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <Navigate
        to={user.role === 'ADMIN' ? '/admin/dashboard' : '/employee/dashboard'}
        replace
      />
    );
  }

  return <>{children}</>;
};

const RootRedirect: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={user.role === 'ADMIN' ? '/admin/dashboard' : '/employee/dashboard'} replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/mobile-scanner" element={<MobileScannerPage />} />
            <Route path="/" element={<RootRedirect />} />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="upload-excel" element={<ExcelUploadPage />} />
              <Route path="import-history" element={<ImportHistoryPage />} />
              <Route path="orders" element={<AllOrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="outgoing-orders" element={<OutgoingOrdersPage />} />
              <Route path="outgoing-orders-2" element={<OutgoingOrdersPage2 />} />
              <Route path="preparation" element={<PreparationPage />} />
              <Route path="invert" element={<InvertStockPage />} />
              <Route path="available-stock" element={<AvailableStockPage />} />
              <Route path="pending-stock" element={<PendingStockPage />} />
              <Route path="dispatch-history" element={<DispatchHistoryPage />} />
              <Route path="failed-attempts" element={<FailedAttemptsPage />} />
              <Route path="book-summary" element={<BookSummaryPage />} />
              <Route path="barcode-sheet" element={<BarcodeSheetPage />} />
              <Route path="barcode-catalog" element={<BarcodeCatalogPage />} />
              <Route path="employees" element={<EmployeesPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
            </Route>

            {/* Employee Routes */}
            <Route
              path="/employee"
              element={
                <ProtectedRoute allowedRoles={['EMPLOYEE']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="dashboard" element={<EmployeeDashboardPage />} />
              <Route path="outgoing-orders" element={<OutgoingOrdersPage />} />
              <Route path="outgoing-orders-2" element={<OutgoingOrdersPage2 />} />
              <Route path="preparation" element={<PreparationPage />} />
              <Route path="invert" element={<InvertStockPage />} />
              <Route path="available-stock" element={<AvailableStockPage />} />
              <Route path="pending-stock" element={<PendingStockPage />} />
              <Route path="barcode-sheet" element={<BarcodeSheetPage />} />
              <Route path="barcode-catalog" element={<BarcodeCatalogPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="my-history" element={<EmployeeMyHistoryPage />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
