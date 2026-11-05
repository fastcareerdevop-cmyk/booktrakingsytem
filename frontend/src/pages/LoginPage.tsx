import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { Button } from '../components/common/Button';
import { BookOpenCheck, Lock, Mail, Shield, User, UserPlus } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // If already logged in, redirect
  if (user) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin/dashboard' : '/employee/dashboard'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toastError('Please fill in both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.success) {
        const { token, user: userData } = res.data.data;
        login(token, userData);
        toastSuccess(`Welcome back, ${userData.name}!`);
        if (userData.role === 'ADMIN') {
          navigate('/admin/dashboard');
        } else {
          navigate('/employee/dashboard');
        }
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      toastError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (role: 'ADMIN' | 'EMPLOYEE') => {
    if (role === 'ADMIN') {
      setEmail('admin@example.com');
      setPassword('Admin@123');
    } else {
      setEmail('emp1@example.com');
      setPassword('Emp@123');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8">
        <div className="text-center mb-8">
          <div className="bg-white border-2 border-red-500/80 rounded-2xl mx-auto inline-flex items-center justify-center shadow-xl px-6 py-3.5 mb-4">
            <img
              src="/fast_logo.png"
              alt="FAST - First Attempt Success Tutorials"
              className="h-14 sm:h-16 w-auto max-w-[280px] object-contain"
            />
          </div>
          <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase">
            FAST DISPATCH PRO
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
              <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
              <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full py-2.5 mt-2 bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white font-bold" isLoading={isLoading}>
            Sign In to Account
          </Button>

          <div className="text-center pt-2">
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>New Employee? Register Here</span>
            </Link>
          </div>
        </form>

        {/* Quick Demo Login Credentials Bar */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
            Quick Demo Login Credentials
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('ADMIN')}
              className="flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-red-600" />
              <span>Admin Demo</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('EMPLOYEE')}
              className="flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <User className="w-3.5 h-3.5 text-emerald-600" />
              <span>Employee Demo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
