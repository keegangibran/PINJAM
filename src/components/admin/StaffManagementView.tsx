'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowLeft,
  Mail,
  Key,
  AlertTriangle,
  Search,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatWib } from '@/lib/timezone';

export interface StaffItem {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  role: 'STAFF' | 'ADMIN';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

export interface StaffManagementViewProps {
  currentStaffId?: string;
}

export default function StaffManagementView({ currentStaffId }: StaffManagementViewProps) {
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'ALL' | 'STAFF' | 'ADMIN'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal Tambah Staf
  const [showAddModal, setShowAddModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<'STAFF' | 'ADMIN'>('STAFF');
  const [creationMethod, setCreationMethod] = useState<'PASSWORD' | 'INVITE'>('PASSWORD');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);

  // Modal Konfirmasi Ubah Status
  const [statusConfirmTarget, setStatusConfirmTarget] = useState<StaffItem | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/staff');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Gagal memuat daftar staf.');
      } else {
        setStaffList(json.data || []);
      }
    } catch {
      setError('Gangguan jaringan saat memuat data staf.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Handle Submit Form Tambah
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || formName.trim().length < 2) {
      setFormError('Nama staf minimal 2 karakter.');
      return;
    }
    if (!formEmail.trim() || !formEmail.includes('@')) {
      setFormError('Format email tidak valid.');
      return;
    }
    if (creationMethod === 'PASSWORD' && formPassword.length < 8) {
      setFormError('Kata sandi awal minimal 8 karakter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, any> = {
        name: formName.trim(),
        email: formEmail.trim().toLowerCase(),
        role: formRole,
      };

      if (creationMethod === 'PASSWORD') {
        payload.password = formPassword;
      } else {
        payload.send_invite = true;
      }

      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setFormError(json.error?.message || 'Gagal membuat akun staf.');
      } else {
        setFormSuccessMessage(json.message || 'Akun staf berhasil dibuat.');
        // Reset form
        setFormName('');
        setFormEmail('');
        setFormPassword('');
        setFormRole('STAFF');
        setCreationMethod('PASSWORD');
        setTimeout(() => {
          setShowAddModal(false);
          setFormSuccessMessage(null);
          fetchStaff();
        }, 1500);
      }
    } catch {
      setFormError('Terjadi gangguan jaringan saat mengirim data staf.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Toggle Status (Aktivasi / Deaktivasi)
  const handleExecuteStatusToggle = async () => {
    if (!statusConfirmTarget) return;

    setIsUpdatingStatus(true);
    setStatusActionError(null);
    try {
      const nextStatus = !statusConfirmTarget.is_active;
      const res = await fetch(`/api/admin/staff/${statusConfirmTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextStatus }),
      });

      const json = await res.json();

      if (!res.ok) {
        setStatusActionError(json.error?.message || 'Gagal mengubah status akun staf.');
      } else {
        setStatusConfirmTarget(null);
        fetchStaff();
      }
    } catch {
      setStatusActionError('Gangguan jaringan saat memproses perubahan status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Filter List
  const filteredStaff = staffList.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'ALL' || item.role === filterRole;
    const matchesStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'ACTIVE' && item.is_active) ||
      (filterStatus === 'INACTIVE' && !item.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalStaff = staffList.length;
  const activeStaff = staffList.filter((s) => s.is_active).length;
  const totalAdmin = staffList.filter((s) => s.role === 'ADMIN').length;
  const inactiveStaff = staffList.filter((s) => !s.is_active).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Kembali ke Dashboard Admin</span>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStaff}
            disabled={loading}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Segarkan</span>
          </Button>
        </div>

        {/* Header Title Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <Users size={22} />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Manajemen Akun Petugas &amp; Staf TU
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Kelola hak akses individual petugas TU (STAFF) dan Administrator (ADMIN) sesuai NFR-03.
                </p>
              </div>
            </div>
          </div>
          <div>
            <Button
              onClick={() => {
                setShowAddModal(true);
                setFormError(null);
                setFormSuccessMessage(null);
              }}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl shadow-sm"
            >
              <UserPlus size={16} />
              <span>Tambah / Undang Petugas</span>
            </Button>
          </div>
        </div>

        {/* Statistics Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Total Petugas</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalStaff}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Staf Aktif</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{activeStaff}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Administrator</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{totalAdmin}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Akun Nonaktif</p>
            <p className="text-2xl font-bold text-slate-400 mt-1">{inactiveStaff}</p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Cari berdasarkan nama atau email petugas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value as any)}
                className="text-xs rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label="Filter berdasarkan peran"
              >
                <option value="ALL">Semua Peran</option>
                <option value="STAFF">Petugas TU (STAFF)</option>
                <option value="ADMIN">Administrator (ADMIN)</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="text-xs rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label="Filter berdasarkan status"
              >
                <option value="ALL">Semua Status</option>
                <option value="ACTIVE">Hanya Aktif</option>
                <option value="INACTIVE">Hanya Nonaktif</option>
              </select>
            </div>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={fetchStaff} className="text-xs">
              Coba Lagi
            </Button>
          </div>
        )}

        {/* Staff Table / List View */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center space-y-3" role="status" aria-label="Memuat daftar staf">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <p className="text-xs text-slate-500">Memuat data akun petugas...</p>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl">
                <Users size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Tidak ada akun staf ditemukan</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchTerm || filterRole !== 'ALL' || filterStatus !== 'ALL'
                  ? 'Coba sesuaikan kata kunci pencarian atau filter yang diterapkan.'
                  : 'Belum ada akun petugas yang terdaftar di sistem PINJAM.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Nama Petugas</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Peran (Role)</th>
                    <th className="py-3 px-4">Status Akun</th>
                    <th className="py-3 px-4">Terdaftar Sejak</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {filteredStaff.map((staff) => {
                    const isSelf = currentStaffId && staff.id === currentStaffId;

                    return (
                      <tr key={staff.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                                staff.role === 'ADMIN' ? 'bg-purple-600' : 'bg-blue-600'
                              }`}
                            >
                              {staff.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                                <span>{staff.name}</span>
                                {isSelf && (
                                  <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full border border-blue-200">
                                    Akun Anda saat ini
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono">ID: {staff.id.slice(0, 8)}...</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Mail size={13} className="text-slate-400 shrink-0" />
                            <span>{staff.email}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {staff.role === 'ADMIN' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-full">
                              <ShieldCheck size={13} className="text-purple-600" />
                              <span>Administrator</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                              <Shield size={13} className="text-emerald-600" />
                              <span>Petugas TU</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {staff.is_active ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Aktif</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              <span>Nonaktif</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                          {formatWib(staff.created_at)}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          {isSelf ? (
                            <span
                              title="Administrator tidak dapat menonaktifkan akun sendiri"
                              className="text-[11px] text-slate-400 italic"
                            >
                              Terkunci (Akun Aktif)
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setStatusActionError(null);
                                setStatusConfirmTarget(staff);
                              }}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                                staff.is_active
                                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              {staff.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Tambah / Undang Petugas */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-staff-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="text-center space-y-1">
              <span className="p-2.5 bg-blue-50 text-blue-700 rounded-2xl inline-block">
                <UserPlus size={24} />
              </span>
              <h3 id="add-staff-modal-title" className="text-base font-bold text-slate-900">
                Tambah / Undang Petugas Baru
              </h3>
              <p className="text-xs text-slate-500">
                Pemberian akun petugas individual untuk staf TU atau admin PINJAM.
              </p>
            </div>

            {formError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {formError}
              </div>
            )}

            {formSuccessMessage && (
              <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{formSuccessMessage}</span>
              </div>
            )}

            <form onSubmit={handleCreateStaff} className="space-y-3.5 text-xs text-slate-700">
              <div>
                <label htmlFor="staff-name" className="block font-semibold text-slate-700 mb-1">
                  Nama Lengkap Petugas <span className="text-red-500">*</span>:
                </label>
                <input
                  id="staff-name"
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso, S.Kom."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="staff-email" className="block font-semibold text-slate-700 mb-1">
                  Email Petugas / Kampus <span className="text-red-500">*</span>:
                </label>
                <input
                  id="staff-email"
                  type="email"
                  required
                  placeholder="Contoh: budi.tu@unimed.ac.id"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Peran Akun (Role) <span className="text-red-500">*</span>:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
                      formRole === 'STAFF'
                        ? 'border-blue-500 bg-blue-50 text-blue-900 font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="STAFF"
                      checked={formRole === 'STAFF'}
                      onChange={() => setFormRole('STAFF')}
                      className="sr-only"
                    />
                    <span>Petugas TU (STAFF)</span>
                  </label>

                  <label
                    className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
                      formRole === 'ADMIN'
                        ? 'border-purple-500 bg-purple-50 text-purple-900 font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="ADMIN"
                      checked={formRole === 'ADMIN'}
                      onChange={() => setFormRole('ADMIN')}
                      className="sr-only"
                    />
                    <span>Administrator (ADMIN)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Metode Registrasi Akun:
                </label>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setCreationMethod('PASSWORD')}
                    className={`p-2 rounded-xl border text-center transition-all ${
                      creationMethod === 'PASSWORD'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Kata Sandi Awal
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreationMethod('INVITE')}
                    className={`p-2 rounded-xl border text-center transition-all ${
                      creationMethod === 'INVITE'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Kirim Undangan Email
                  </button>
                </div>
              </div>

              {creationMethod === 'PASSWORD' ? (
                <div>
                  <label htmlFor="staff-password" className="block font-semibold text-slate-700 mb-1">
                    Kata Sandi Awal (Min. 8 karakter) <span className="text-red-500">*</span>:
                  </label>
                  <div className="relative">
                    <input
                      id="staff-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Masukkan kata sandi awal..."
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 p-2.5 pr-9 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Petugas dapat langsung masuk ke sistem dengan email dan kata sandi ini.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                  Tautan aktivasi dan pengaturan kata sandi akan dikirim langsung ke alamat email petugas melalui Supabase Auth.
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed space-y-1">
                <p className="font-semibold text-slate-800 flex items-center gap-1">
                  <Lock size={12} className="text-slate-500" />
                  <span>Kepatuhan Keamanan (NFR-03):</span>
                </p>
                <p>
                  Satu akun hanya untuk satu petugas. Dilarang berbagi akun. Email tidak boleh sama dengan akun mahasiswa terdaftar.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 text-xs py-2.5 rounded-xl"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2.5 rounded-xl font-semibold"
                >
                  {isSubmitting ? 'Memproses...' : 'Simpan Akun'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Ubah Status */}
      {statusConfirmTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-status-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl space-y-4 animate-scale-up">
            <div
              className={`h-12 w-12 rounded-full flex items-center justify-center mx-auto text-xl ${
                statusConfirmTarget.is_active ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {statusConfirmTarget.is_active ? <AlertTriangle size={24} /> : <CheckCircle2 size={24} />}
            </div>

            <div className="text-center space-y-1">
              <h3 id="confirm-status-modal-title" className="text-base font-bold text-slate-900">
                {statusConfirmTarget.is_active ? 'Nonaktifkan Akun Petugas?' : 'Aktifkan Kembali Akun Petugas?'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {statusConfirmTarget.is_active ? (
                  <>
                    Akun <strong className="text-slate-800">{statusConfirmTarget.name}</strong> akan segera dicabut hak aksesnya. Petugas tidak akan dapat login atau mengoperasikan Kiosk dan panel admin.
                  </>
                ) : (
                  <>
                    Akun <strong className="text-slate-800">{statusConfirmTarget.name}</strong> akan diaktifkan kembali dan dapat login seperti biasa.
                  </>
                )}
              </p>
            </div>

            {statusActionError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {statusActionError}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isUpdatingStatus}
                onClick={() => setStatusConfirmTarget(null)}
                className="flex-1 text-xs py-2.5 rounded-xl"
              >
                Batal
              </Button>
              <Button
                type="button"
                disabled={isUpdatingStatus}
                onClick={handleExecuteStatusToggle}
                className={`flex-1 text-xs py-2.5 rounded-xl font-semibold text-white ${
                  statusConfirmTarget.is_active
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isUpdatingStatus ? 'Memproses...' : statusConfirmTarget.is_active ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
