import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, ArrowLeft, LogOut, CheckCircle, Clock } from 'lucide-react';
import { Button } from '../../components/common/Button';

interface AccessDeniedPageProps {
  pageName?: string;
  customMessage?: string;
}

export const AccessDeniedPage: React.FC<AccessDeniedPageProps> = ({ pageName, customMessage }) => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const isPending = user?.accessStatus === 'PENDING';
  const isRestricted = user?.accessStatus === 'RESTRICTED';

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 text-center relative overflow-hidden">
        {/* Accent Top Border */}
        <div className={`absolute top-0 left-0 right-0 h-2 ${isPending ? 'bg-amber-500' : 'bg-rose-600'}`} />

        <div className="mb-6 inline-flex">
          <div
            className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-inner ${
              isPending ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-rose-50 text-rose-600 border border-rose-200'
            }`}
          >
            {isPending ? <Clock className="w-10 h-10 animate-pulse" /> : <ShieldAlert className="w-10 h-10" />}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
          {isPending
            ? 'Account Pending Admin Approval'
            : isRestricted
            ? 'Account Access Restricted'
            : 'Access Denied'}
        </h1>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4 bg-slate-100 text-slate-700">
          <span>User: {user?.name || 'Employee'}</span>
          <span>•</span>
          <span
            className={
              isPending
                ? 'text-amber-600'
                : isRestricted
                ? 'text-rose-600'
                : 'text-emerald-600'
            }
          >
            Status: {user?.accessStatus || 'PENDING'}
          </span>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          {customMessage ? (
            customMessage
          ) : isPending ? (
            'Your registration was successful, but your account is waiting for an Administrator to grant page permissions. Once approved, the authorized Dispatch System modules will appear in your sidebar.'
          ) : isRestricted ? (
            'Your account access has been restricted by an administrator. Please reach out to your supervisor or system admin to resolve this.'
          ) : pageName ? (
            <>
              You do not have access rights to open <span className="font-semibold text-slate-800">"{pageName}"</span>. This page has not been assigned to your employee profile by Admin.
            </>
          ) : (
            'You do not have permission to view this page. Access to Dispatch System modules is strictly governed by Role-Based Access Control (RBAC).'
          )}
        </p>

        {/* Informational Guidance Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left mb-6 text-xs text-slate-600 space-y-1.5">
          <p className="font-bold text-slate-700 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
            What should I do?
          </p>
          <p>• Contact your System Administrator to request module permissions.</p>
          <p>• The Admin can assign pages via the <strong>RBAC (Access Control)</strong> module.</p>
          <p>• Once permissions are updated, changes will reflect instantly.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back</span>
          </Button>

          {isAdmin ? (
            <Link to="/admin/dashboard" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full">
                Admin Dashboard
              </Button>
            </Link>
          ) : user?.permissions && user.permissions.includes('dashboard') ? (
            <Link to="/employee/dashboard" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full">
                Employee Dashboard
              </Button>
            </Link>
          ) : (
            <Button
              variant="danger"
              onClick={handleSignOut}
              className="w-full sm:w-auto flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
