import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { RbacEmployee, RbacAuditLogItem, AccessStatus, RbacPageItem } from '../../types';
import { DISPATCH_SYSTEM_PAGES, RBAC_CATEGORIES } from '../../config/rbacPages';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  KeyRound,
  RotateCcw,
  CheckSquare,
  Square,
  History,
  FileText,
  UserPlus,
  Mail,
  Phone,
  Building2,
  Briefcase,
  BadgeCheck,
  Lock,
  Eye,
  EyeOff,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

const DEPARTMENTS = [
  'ALL',
  'Dispatch & Outgoing',
  'Warehouse & Inventory',
  'Order Packaging & Prep',
  'Logistics & Tracking',
  'Operations & Supply Chain',
  'Quality Control',
  'Administration & Support',
];

export const RbacPage: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();

  // Tab State: 'employees' | 'history' | 'catalog'
  const [activeTab, setActiveTab] = useState<'employees' | 'history' | 'catalog'>('employees');

  // Employee Management State
  const [employees, setEmployees] = useState<RbacEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Manage Access Modal State
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<RbacEmployee | null>(null);
  const [modalPermissions, setModalPermissions] = useState<string[]>([]);
  const [modalStatus, setModalStatus] = useState<AccessStatus>('ACTIVE');
  const [modalRemarks, setModalRemarks] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Access History Audit Logs State
  const [auditLogs, setAuditLogs] = useState<RbacAuditLogItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsSearchTerm, setLogsSearchTerm] = useState('');

  // Register Employee Modal State (Admin Creating New Employee)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmpData, setNewEmpData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [isCreatingEmployee, setIsCreatingEmployee] = useState(false);

  // Fetch employees
  const fetchEmployees = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedDepartment !== 'ALL') params.append('department', selectedDepartment);
      if (selectedStatus !== 'ALL') params.append('status', selectedStatus);

      const res = await api.get(`/rbac/employees?${params.toString()}`);
      if (res.data.success) {
        setEmployees(res.data.data);
      }
    } catch (err: any) {
      toastError(err.response?.data?.message || 'Failed to load employees.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch audit logs
  const fetchAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      if (logsSearchTerm) params.append('search', logsSearchTerm);
      params.append('limit', '50');

      const res = await api.get(`/rbac/logs?${params.toString()}`);
      if (res.data.success) {
        setAuditLogs(res.data.data.logs);
      }
    } catch (err: any) {
      toastError(err.response?.data?.message || 'Failed to load access logs.');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [searchTerm, selectedDepartment, selectedStatus]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchAuditLogs();
    }
  }, [activeTab, logsSearchTerm]);

  // Open Manage Access Modal
  const handleOpenManageAccess = (employee: RbacEmployee) => {
    setSelectedEmployee(employee);
    setModalPermissions([...employee.permissions]);
    setModalStatus(employee.accessStatus);
    setModalRemarks('');
    setIsManageModalOpen(true);
  };

  // Toggle single permission
  const handleTogglePermission = (pageId: string) => {
    setModalPermissions((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  };

  // Select All Permissions
  const handleSelectAll = () => {
    setModalPermissions(DISPATCH_SYSTEM_PAGES.map((p) => p.id));
  };

  // Deselect All Permissions
  const handleDeselectAll = () => {
    setModalPermissions([]);
  };

  // Apply Role Presets
  const handleApplyPreset = (preset: 'all' | 'dispatch' | 'inventory') => {
    if (preset === 'all') {
      setModalPermissions(DISPATCH_SYSTEM_PAGES.map((p) => p.id));
    } else if (preset === 'dispatch') {
      setModalPermissions([
        'dashboard',
        'dispatch_entry',
        'outgoing_orders_2',
        'preparation',
        'barcode_sheet',
        'barcode_catalog',
        'dispatch_list',
      ]);
    } else if (preset === 'inventory') {
      setModalPermissions([
        'dashboard',
        'stock_inward',
        'available_stock',
        'pending_stock',
        'barcode_catalog',
      ]);
    }
  };

  // Save updated permissions
  const handleSavePermissions = async () => {
    if (!selectedEmployee) return;

    setIsUpdating(true);
    try {
      const res = await api.put(`/rbac/employees/${selectedEmployee.id}/permissions`, {
        permissions: modalPermissions,
        accessStatus: modalStatus,
        remarks: modalRemarks.trim() || undefined,
      });

      if (res.data.success) {
        toastSuccess(`Access permissions updated successfully for ${selectedEmployee.name}!`);
        setIsManageModalOpen(false);
        fetchEmployees();
        if (activeTab === 'history') fetchAuditLogs();
      }
    } catch (err: any) {
      toastError(err.response?.data?.message || 'Failed to update permissions.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Quick Status Change
  const handleQuickStatusChange = async (employeeId: string, newStatus: AccessStatus) => {
    try {
      const res = await api.patch(`/rbac/employees/${employeeId}/status`, {
        accessStatus: newStatus,
        remarks: `Quick status change to ${newStatus}`,
      });

      if (res.data.success) {
        toastSuccess(`Status changed to ${newStatus}.`);
        setEmployees((prev) =>
          prev.map((emp) =>
            emp.id === employeeId ? { ...emp, accessStatus: newStatus, isActive: newStatus !== 'RESTRICTED' } : emp
          )
        );
      }
    } catch (err: any) {
      toastError(err.response?.data?.message || 'Failed to update status.');
    }
  };

  // Create Employee
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newEmpData.name.trim() ||
      !newEmpData.email.trim() ||
      !newEmpData.password
    ) {
      toastError('All fields are required.');
      return;
    }

    setIsCreatingEmployee(true);
    try {
      const res = await api.post('/rbac/register', {
        name: newEmpData.name.trim(),
        email: newEmpData.email.trim().toLowerCase(),
        password: newEmpData.password,
      });

      if (res.data.success) {
        toastSuccess(`Employee ${newEmpData.name} registered successfully! (Pending Access)`);
        setIsAddModalOpen(false);
        setNewEmpData({
          name: '',
          email: '',
          password: '',
        });
        fetchEmployees();
      }
    } catch (err: any) {
      toastError(err.response?.data?.message || 'Failed to register employee.');
    } finally {
      setIsCreatingEmployee(false);
    }
  };

  // KPI Metrics Calculation
  const totalEmployees = employees.length;
  const activeCount = employees.filter((e) => e.accessStatus === 'ACTIVE').length;
  const pendingCount = employees.filter((e) => e.accessStatus === 'PENDING').length;
  const restrictedCount = employees.filter((e) => e.accessStatus === 'RESTRICTED').length;

  return (
    <div className="space-y-6">
      {/* Page Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-100 text-red-600 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                RBAC (Role-Based Access Control)
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Manage employee registrations, grant/revoke page-level access permissions, and track security audit history
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (activeTab === 'history') fetchAuditLogs();
              else fetchEmployees();
            }}
            className="flex items-center gap-1.5 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </Button>

          <Button
            variant="primary"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-700 font-bold"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register Employee</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-slate-700 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Staff
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{totalEmployees}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                Active Access
              </p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{activeCount}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                Pending Access
              </p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{pendingCount}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-rose-500 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                Restricted / Suspended
              </p>
              <p className="text-2xl font-bold text-rose-700 mt-1">{restrictedCount}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('employees')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'employees'
              ? 'border-red-600 text-red-600 bg-red-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Employee Access Management ({employees.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'history'
              ? 'border-red-600 text-red-600 bg-red-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Access History Logs</span>
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'catalog'
              ? 'border-red-600 text-red-600 bg-red-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>System Page Catalog ({DISPATCH_SYSTEM_PAGES.length})</span>
        </button>
      </div>

      {/* TAB 1: EMPLOYEE ACCESS MANAGEMENT */}
      {activeTab === 'employees' && (
        <Card className="p-5 space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                placeholder="Search by Employee Name, ID, or Email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              {/* Department Filter */}
              <div className="relative flex-1 md:w-56">
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                  <option value="ALL">All Departments</option>
                  {DEPARTMENTS.filter((d) => d !== 'ALL').map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                <Building2 className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>

              {/* Status Filter */}
              <div className="relative flex-1 md:w-44">
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PENDING">Pending Access</option>
                  <option value="RESTRICTED">Restricted</option>
                </select>
                <Filter className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : employees.length === 0 ? (
            <EmptyState
              title="No employees found"
              description="No registered staff matching your search or filter criteria."
            />
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-slate-700 uppercase font-semibold text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Employee Details</th>
                    <th className="py-3 px-4">Department & Role</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Access Status</th>
                    <th className="py-3 px-4">Page Permissions</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {employees.map((emp) => {
                    const status = emp.accessStatus || 'PENDING';
                    const permsCount = emp.permissions ? emp.permissions.length : 0;

                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Employee Details */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0 text-xs">
                              {emp.name
                                .split(' ')
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-xs">{emp.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-semibold">
                                  {emp.employeeId}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Department & Role */}
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-800">{emp.department || 'Operations'}</p>
                          <p className="text-[11px] text-slate-500">{emp.designation || 'Staff Executive'}</p>
                        </td>

                        {/* Contact */}
                        <td className="py-3 px-4">
                          <p className="text-slate-700 flex items-center gap-1.5 font-mono text-[11px]">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            {emp.email}
                          </p>
                          {emp.mobileNumber && emp.mobileNumber !== 'N/A' && (
                            <p className="text-slate-500 flex items-center gap-1.5 text-[11px] mt-0.5">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              {emp.mobileNumber}
                            </p>
                          )}
                        </td>

                        {/* Access Status Badge */}
                        <td className="py-3 px-4">
                          {status === 'ACTIVE' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active Access
                            </span>
                          )}
                          {status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              Pending Access
                            </span>
                          )}
                          {status === 'RESTRICTED' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Restricted
                            </span>
                          )}
                        </td>

                        {/* Page Permissions */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                permsCount > 0
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {permsCount} of {DISPATCH_SYSTEM_PAGES.length} Pages
                            </span>
                          </div>
                          {permsCount > 0 ? (
                            <p className="text-[10px] text-slate-400 truncate max-w-[200px] mt-1">
                              {emp.permissions.slice(0, 3).join(', ')}
                              {permsCount > 3 ? ` +${permsCount - 3} more` : ''}
                            </p>
                          ) : (
                            <p className="text-[10px] text-amber-600 font-medium mt-1">
                              No pages granted
                            </p>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              onClick={() => handleOpenManageAccess(emp)}
                              className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-red-600 hover:border-red-500 bg-white shadow-xs"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-red-600" />
                              <span>Manage Access</span>
                            </Button>

                            {/* Quick status button */}
                            {status === 'PENDING' ? (
                              <button
                                onClick={() => handleQuickStatusChange(emp.id, 'ACTIVE')}
                                title="Approve & Activate"
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors border border-emerald-200"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            ) : status === 'ACTIVE' ? (
                              <button
                                onClick={() => handleQuickStatusChange(emp.id, 'RESTRICTED')}
                                title="Restrict Access"
                                className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors border border-rose-200"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleQuickStatusChange(emp.id, 'ACTIVE')}
                                title="Reactivate Access"
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors border border-emerald-200"
                              >
                                <CheckCircle2 className="w-4 h-4" />
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
          )}
        </Card>
      )}

      {/* TAB 2: ACCESS HISTORY LOGS */}
      {activeTab === 'history' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search logs by employee, admin, or remarks..."
                value={logsSearchTerm}
                onChange={(e) => setLogsSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>

            <span className="text-xs text-slate-500 font-medium">
              Showing latest {auditLogs.length} audit entries
            </span>
          </div>

          {isLoadingLogs ? (
            <div className="py-12 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : auditLogs.length === 0 ? (
            <EmptyState
              title="No access logs found"
              description="Permission changes and registration logs will appear here."
            />
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-slate-700 uppercase font-semibold text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Timestamp (IST)</th>
                    <th className="py-3 px-4">Target Employee</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Status Transition</th>
                    <th className="py-3 px-4">Changed By</th>
                    <th className="py-3 px-4">Permissions Change / Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {auditLogs.map((log) => {
                    const dateStr = new Date(log.createdAt).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    });

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {dateStr}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-800">{log.targetName}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {log.targetEmployeeId || log.targetEmail}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              log.action === 'PERMISSIONS_UPDATED'
                                ? 'bg-blue-100 text-blue-800'
                                : log.action === 'EMPLOYEE_REGISTERED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {log.action.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {log.previousStatus && log.newStatus ? (
                            <span className="flex items-center gap-1 text-slate-600">
                              <span className="text-slate-500">{log.previousStatus}</span>
                              <ChevronRight className="w-3 h-3 text-slate-400" />
                              <span className="font-bold text-slate-800">{log.newStatus}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">N/A</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-700">{log.actorName}</p>
                          <p className="text-[10px] text-slate-400">{log.actorEmail}</p>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          {log.remarks && (
                            <p className="text-[11px] text-slate-700 font-medium">{log.remarks}</p>
                          )}
                          {log.newPermissions && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Active Permissions Count: {log.newPermissions.length}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: SYSTEM PAGE CATALOG */}
      {activeTab === 'catalog' && (
        <Card className="p-5 space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Dispatch System Registered Modules ({DISPATCH_SYSTEM_PAGES.length} Total)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              These are all available pages in the Dispatch System that can be independently granted or revoked for any employee.
            </p>
          </div>

          <div className="space-y-6">
            {RBAC_CATEGORIES.map((category) => {
              const pagesInCat = DISPATCH_SYSTEM_PAGES.filter((p) => p.category === category);
              if (pagesInCat.length === 0) return null;

              return (
                <div key={category} className="space-y-3">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      {category}
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                      {pagesInCat.length} pages
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pagesInCat.map((page) => (
                      <div
                        key={page.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                            {page.id}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {page.employeePath}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 mt-2">{page.name}</p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          {page.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* MANAGE ACCESS MODAL */}
      <Modal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        title="Manage Employee Access Permissions"
        maxWidth="4xl"
      >
        {selectedEmployee && (
          <div className="space-y-6">
            {/* Top Employee Profile Header */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-600 text-white font-bold flex items-center justify-center text-sm shadow-md">
                  {selectedEmployee.name
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{selectedEmployee.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                    <span className="font-mono font-bold text-slate-700 bg-slate-200 px-1.5 py-0.2 rounded text-[10px]">
                      {selectedEmployee.employeeId}
                    </span>
                    <span>•</span>
                    <span>{selectedEmployee.department}</span>
                    <span>•</span>
                    <span>{selectedEmployee.designation}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {selectedEmployee.email}
                  </p>
                </div>
              </div>

              {/* Status Selector */}
              <div className="flex flex-col sm:items-end">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Access Status
                </label>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as AccessStatus)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border focus:outline-none ${
                    modalStatus === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : modalStatus === 'PENDING'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-rose-50 text-rose-800 border-rose-300'
                  }`}
                >
                  <option value="ACTIVE">Active (Permitted)</option>
                  <option value="PENDING">Pending Access (Awaiting Approval)</option>
                  <option value="RESTRICTED">Restricted (Suspended)</option>
                </select>
              </div>
            </div>

            {/* Permissions Controls Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">
                  Select Accessible Pages:
                </span>
                <span className="text-xs font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                  {modalPermissions.length} of {DISPATCH_SYSTEM_PAGES.length} Selected
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Select All</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Square className="w-3.5 h-3.5 text-rose-600" />
                  <span>Deselect All</span>
                </button>

                <div className="h-4 w-px bg-slate-300 hidden sm:block" />

                <button
                  type="button"
                  onClick={() => handleApplyPreset('dispatch')}
                  className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  Preset: Dispatch
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('inventory')}
                  className="px-2 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                  Preset: Inventory
                </button>
              </div>
            </div>

            {/* Grouped Page Permissions Checkboxes */}
            <div className="space-y-5 max-h-[46vh] overflow-y-auto pr-1">
              {RBAC_CATEGORIES.map((category) => {
                const categoryPages = DISPATCH_SYSTEM_PAGES.filter((p) => p.category === category);
                if (categoryPages.length === 0) return null;

                const allInCatSelected = categoryPages.every((p) => modalPermissions.includes(p.id));

                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        {category}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (allInCatSelected) {
                            setModalPermissions((prev) =>
                              prev.filter((id) => !categoryPages.some((cp) => cp.id === id))
                            );
                          } else {
                            const newIds = categoryPages.map((p) => p.id);
                            setModalPermissions((prev) => Array.from(new Set([...prev, ...newIds])));
                          }
                        }}
                        className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold"
                      >
                        {allInCatSelected ? 'Deselect Category' : 'Select Category'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {categoryPages.map((page) => {
                        const isChecked = modalPermissions.includes(page.id);

                        return (
                          <label
                            key={page.id}
                            onClick={() => handleTogglePermission(page.id)}
                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all ${
                              isChecked
                                ? 'bg-red-50/50 border-red-300 shadow-xs'
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by parent label onClick
                              className="w-4 h-4 mt-0.5 rounded text-red-600 focus:ring-red-500 border-slate-300"
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-xs font-bold ${
                                  isChecked ? 'text-red-950' : 'text-slate-800'
                                }`}
                              >
                                {page.name}
                              </p>
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {page.description}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Audit Remarks */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Admin Audit Remarks (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Granted morning shift dispatch & outgoing sheet permissions"
                value={modalRemarks}
                onChange={(e) => setModalRemarks(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
            </div>

            {/* Modal Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <Button
                variant="outline"
                onClick={() => setIsManageModalOpen(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                onClick={handleSavePermissions}
                isLoading={isUpdating}
                className="bg-red-600 hover:bg-red-700 font-bold px-6"
              >
                Update Access
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* REGISTER EMPLOYEE MODAL (ADMIN SELF-CREATE) */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New Employee (RBAC)"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newEmpData.name}
              onChange={(e) => setNewEmpData({ ...newEmpData, name: e.target.value })}
              placeholder="e.g. Divya Yadav"
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={newEmpData.email}
              onChange={(e) => setNewEmpData({ ...newEmpData, email: e.target.value })}
              placeholder="name@example.com"
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Temporary Password <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newEmpData.password}
              onChange={(e) => setNewEmpData({ ...newEmpData, password: e.target.value })}
              placeholder="Min. 6 characters"
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
            />
          </div>

          <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
            ℹ️ The employee will be registered with <strong>Pending Access</strong> status. You can immediately assign their page permissions after creating the account.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isCreatingEmployee}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isCreatingEmployee}
              className="bg-red-600 hover:bg-red-700 font-bold px-6"
            >
              Create Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
