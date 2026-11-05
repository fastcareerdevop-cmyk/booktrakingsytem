import React, { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { Button } from '../components/common/Button';
import {
  User,
  Mail,
  Building2,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

const DEPARTMENTS = [
  'Dispatch & Outgoing',
  'Warehouse & Inventory',
  'Order Packaging & Prep',
  'Logistics & Tracking',
  'Operations & Supply Chain',
  'Quality Control',
  'Administration & Support',
];

export const RegisterPage: React.FC = () => {
  const { user } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();
  const navigate = useNavigate();

  // If already logged in, redirect
  if (user) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin/dashboard' : '/employee/dashboard'} replace />;
  }

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: 'Dispatch & Outgoing',
    password: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [registeredData, setRegisteredData] = useState<any>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.department.trim() || !formData.password) {
      toastError('Please fill in all required fields.');
      return;
    }

    if (formData.password.length < 6) {
      toastError('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post('/rbac/register', {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        department: formData.department.trim(),
        password: formData.password,
      });

      if (res.data.success) {
        toastSuccess('Registration submitted successfully! Your account is pending admin approval.');
        setRegisteredData(res.data.data);
        setIsSuccess(true);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Registration failed. Please verify your details and try again.';
      toastError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-emerald-500" />

          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-bold text-slate-800 mb-2">Registration Submitted!</h2>
          <p className="text-sm text-slate-600 mb-6">
            Welcome, <strong className="text-slate-800">{registeredData?.name}</strong>. Your employee account has been created successfully.
          </p>

          <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 text-left mb-6">
            <div className="flex items-center gap-2 font-bold text-amber-800 text-xs uppercase tracking-wider mb-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Current Status: Pending Admin Approval</span>
            </div>
            <p className="text-xs text-amber-900/90 leading-relaxed">
              In accordance with system security policy, all newly registered employees are set to <strong>Pending Access</strong>. You cannot access protected Dispatch System pages until an Administrator grants your permissions in the <strong>RBAC Module</strong>.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left mb-6 text-xs text-slate-700 space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Full Name:</span>
              <span className="font-bold">{registeredData?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Registered Email:</span>
              <span>{registeredData?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Department:</span>
              <span>{registeredData?.department}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/login" className="w-full">
              <Button variant="primary" className="w-full py-2.5 bg-red-600 hover:bg-red-700 font-bold">
                Proceed to Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center py-8 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-6 sm:p-8">
        {/* Header with FAST Logo */}
        <div className="text-center mb-6">
          <div className="bg-white border-2 border-red-500/80 rounded-2xl mx-auto inline-flex items-center justify-center shadow-md px-5 py-2.5 mb-3">
            <img
              src="/fast_logo.png"
              alt="FAST - First Attempt Success Tutorials"
              className="h-12 w-auto max-w-[240px] object-contain"
            />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Employee Registration</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Create your employee account for the Dispatch Management System
          </p>
        </div>

        {/* Security / RBAC Banner */}
        <div className="mb-6 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-800">Role-Based Access Control (RBAC):</strong> After completing registration, your status will be set to <strong className="text-amber-700">Pending Access</strong>. The Administrator will review and grant access to the relevant modules.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Divya Yadav"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>

          {/* Email Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="name@example.com"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>

          {/* Department */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Department <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                name="department"
                value={formData.department}
                onChange={handleChange}
                required
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Min. 6 characters"
                required
                className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full py-2.5 mt-4 bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white font-bold"
            isLoading={isLoading}
          >
            Submit Employee Registration
          </Button>
        </form>

        {/* Footer links */}
        <div className="mt-6 pt-4 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-500">
            Already have an active account?{' '}
            <Link to="/login" className="font-bold text-red-600 hover:text-red-700 inline-flex items-center gap-1">
              Sign In here <ArrowRight className="w-3 h-3" />
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
