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
import { RbacPage } from './pages/admin/RbacPage';
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
import { RegisterPage } from './pages/RegisterPage';
import { AccessDeniedPage } from './pages/common/AccessDeniedPage';

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

// Employee RBAC Page-Level Guard
const EmployeePageGuard: React.FC<{
  pageId: string;
  pageName: string;
  children: React.ReactNode;
}> = ({ pageId, pageName, children }) => {
  const { user, isAdmin } = useAuth();

  if (isAdmin) {
    return <>{children}</>;
  }

  if (user?.accessStatus === 'PENDING') {
    return (
      <AccessDeniedPage
        pageName={pageName}
        customMessage="Your employee registration is pending Administrator approval. Protected dispatch modules will unlock once your access permissions are assigned."
      />
    );
  }

  if (user?.accessStatus === 'RESTRICTED') {
    return (
      <AccessDeniedPage
        pageName={pageName}
        customMessage="Your account access has been restricted by an administrator. Please contact management."
      />
    );
  }

  const permissions = user?.permissions || [];
  if (!permissions.includes(pageId)) {
    return <AccessDeniedPage pageName={pageName} />;
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
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/access-denied" element={<AccessDeniedPage />} />
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
              <Route path="rbac" element={<RbacPage />} />
            </Route>

            {/* Employee Routes with RBAC Page Guards */}
            <Route
              path="/employee"
              element={
                <ProtectedRoute allowedRoles={['EMPLOYEE']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route
                path="dashboard"
                element={
                  <EmployeePageGuard pageId="dashboard" pageName="Dashboard">
                    <EmployeeDashboardPage />
                  </EmployeePageGuard>
                }
              />
              <Route
                path="outgoing-orders"
                element={
                  <EmployeePageGuard pageId="dispatch_entry" pageName="Dispatch Entry (Outgoing Sheet)">
                    <OutgoingOrdersPage />
                  </EmployeePageGuard>
                }
              />
              <Route
                path="outgoing-orders-2"
                element={
                  <EmployeePageGuard pageId="outgoing_orders_2" pageName="Outgoing Sheet 2">
                    <OutgoingOrdersPage2 />
                  </EmployeePageGuard>
                }
              />
              <Route
                path="preparation"
                element={
                  <EmployeePageGuard pageId="preparation" pageName="Preparation (तैयारी)">
                    <PreparationPage />
                  </EmployeePageGuard>
                }
              />
              <Route
                path="invert"
                element={
                  <EmployeePageGuard pageId="stock_inward" pageName="Stock Inward">
                    <InvertStockPage />
                  </EmployeePageGuard>
                }
              />
              <Route
                path="available-stock"
                element={
                  <EmployeePageGuard pageId="available_stock" pageName="Available Stock">
                    <AvailableStockPage />
                  </EmployeePageGuard>
                }
              />
              <Route
                path="pending-stock"
                element={
                  <EmployeePageGuard pageId="pending_stock" pageName="Pending Book Stock">
                    <PendingStockPage />
                  </EmployeePageGuard>
                }
              />
              <Route
                path="barcode-sheet"
                element={
                  <EmployeePageGuard pageId="barcode_sheet" pageName="Student Barcode Sheet">
                    <BarcodeSheetPage />
                  </EmployeePageGuard>
                }
              />
              <Route
                path="barcode-catalog"
                element={
                  <EmployeePageGuard pageId="barcode_catalog" pageName="Barcode Directory">
                    <BarcodeCatalogPage />
                  </EmployeePageGuard>
                }
              />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route
                path="my-history"
                element={
                  <EmployeePageGuard pageId="dispatch_list" pageName="My Dispatch History">
                    <EmployeeMyHistoryPage />
                  </EmployeePageGuard>
                }
              />
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
