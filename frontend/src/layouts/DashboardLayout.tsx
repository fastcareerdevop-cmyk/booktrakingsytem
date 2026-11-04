import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Upload,
  History,
  Boxes,
  Truck,
  BookOpen,
  Users,
  FileBarChart2,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  FileCheck2,
  Clock,
  UserCheck,
  ScanLine,
  PackagePlus,
  Barcode,
  Layers,
  PackageCheck,
} from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const { user, logout, isAdmin, isEmployee } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const adminNavItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Upload Excel', path: '/admin/upload-excel', icon: <Upload className="w-5 h-5" /> },
    { label: 'Import History', path: '/admin/import-history', icon: <History className="w-5 h-5" /> },
    { label: 'All Orders', path: '/admin/orders', icon: <Boxes className="w-5 h-5" /> },
    { label: 'Outgoing Sheet', path: '/admin/outgoing-orders', icon: <Truck className="w-5 h-5" /> },
    { label: 'Outgoing Sheet 2', path: '/admin/outgoing-orders-2', icon: <Layers className="w-5 h-5" /> },
    { label: 'Preparation (तैयारी)', path: '/admin/preparation', icon: <PackageCheck className="w-5 h-5" /> },
    { label: 'Stock Inward', path: '/admin/invert', icon: <PackagePlus className="w-5 h-5" /> },
    { label: 'Available Stock', path: '/admin/available-stock', icon: <Boxes className="w-5 h-5" /> },
    { label: 'Pending Book Stock', path: '/admin/pending-stock', icon: <Clock className="w-5 h-5" /> },
    { label: 'Student Barcode Sheet', path: '/admin/barcode-sheet', icon: <ScanLine className="w-5 h-5" /> },
    { label: 'Barcode Directory (बारकोड सूची)', path: '/admin/barcode-catalog', icon: <Barcode className="w-5 h-5" /> },
    { label: 'Dispatch History', path: '/admin/dispatch-history', icon: <FileCheck2 className="w-5 h-5" /> },
    { label: 'Book Summary', path: '/admin/book-summary', icon: <BookOpen className="w-5 h-5" /> },
    { label: 'Employees', path: '/admin/employees', icon: <Users className="w-5 h-5" /> },
    { label: 'Reports', path: '/admin/reports', icon: <FileBarChart2 className="w-5 h-5" /> },
    { label: 'Audit Logs', path: '/admin/audit-logs', icon: <ShieldAlert className="w-5 h-5" /> },
  ];

  const employeeNavItems = [
    { label: 'Dashboard', path: '/employee/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Outgoing Sheet', path: '/employee/outgoing-orders', icon: <Truck className="w-5 h-5" /> },
    { label: 'Outgoing Sheet 2', path: '/employee/outgoing-orders-2', icon: <Layers className="w-5 h-5" /> },
    { label: 'Preparation (तैयारी)', path: '/employee/preparation', icon: <PackageCheck className="w-5 h-5" /> },
    { label: 'Student Barcode Sheet', path: '/employee/barcode-sheet', icon: <ScanLine className="w-5 h-5" /> },
    { label: 'Barcode Directory (बारकोड सूची)', path: '/employee/barcode-catalog', icon: <Barcode className="w-5 h-5" /> },
    { label: 'Stock Inward', path: '/employee/invert', icon: <PackagePlus className="w-5 h-5" /> },
    { label: 'Available Stock', path: '/employee/available-stock', icon: <Boxes className="w-5 h-5" /> },
    { label: 'Pending Book Stock', path: '/employee/pending-stock', icon: <Clock className="w-5 h-5" /> },
    { label: 'My Dispatch History', path: '/employee/my-history', icon: <Clock className="w-5 h-5" /> },
  ];

  const navItems = isAdmin ? adminNavItems : employeeNavItems;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center">
            <img src="/fast_logo.png" alt="FAST Education" className="h-9 w-auto max-w-[170px] object-contain" />
          </div>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar for Desktop & Mobile Overlay */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-slate-900 text-slate-300 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Logo / Header */}
          <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="w-full flex items-center justify-between">
              <div className="w-full bg-white rounded-xl px-3 py-2.5 shadow-lg border border-slate-700/80 flex items-center justify-center">
                <img
                  src="/fast_logo.png"
                  alt="FAST - First Attempt Success Tutorials"
                  className="h-11 sm:h-12 w-auto max-w-[210px] object-contain"
                />
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden text-slate-400 hover:text-white ml-2 p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Profile Pill in Sidebar */}
          <div className="px-3 py-2.5 mx-3 my-2.5 rounded-xl bg-slate-800/90 border border-slate-700/70 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center font-semibold text-sm shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-bold text-white truncate">{user?.name || 'User'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                    isAdmin ? 'bg-red-500/25 text-red-300' : 'bg-emerald-500/25 text-emerald-300'
                  }`}
                >
                  {user?.role}
                </span>
                <span className="text-[10px] text-slate-400 truncate">{user?.email}</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="px-3 py-1 space-y-0.5 overflow-y-auto max-h-[calc(100vh-230px)]">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-red-600 text-white shadow-xs font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <span className="w-4 h-4 shrink-0 flex items-center justify-center">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Logout Bottom Button */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Container */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Desktop Top Navbar */}
        <div className="hidden md:flex h-16 bg-white border-b border-slate-200 px-8 items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-800 capitalize">
              {location.pathname.split('/')[2]?.replace('-', ' ') || 'Dashboard'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 font-medium">Timezone: Asia/Kolkata (IST)</span>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-slate-700">{user?.name}</span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Page Inner Container */}
        <div className="p-4 sm:p-6 lg:p-8 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
