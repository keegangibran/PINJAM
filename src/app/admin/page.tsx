/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatWib } from '@/lib/timezone';

interface SummaryData {
  total_projectors: number;
  available_count: number;
  borrowed_count: number;
  overdue_count: number;
  maintenance_count: number;
}

interface LoanRecord {
  id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: 'ACTIVE' | 'COMPLETED';
  is_overdue: boolean;
  borrow_identification_method: 'QR' | 'MANUAL_LOOKUP';
  returned_by_type: 'BORROWER' | 'REPRESENTATIVE' | null;
  returned_by_name: string | null;
  return_condition: 'NORMAL' | 'REPORTED_ISSUE' | null;
  damage_notes: string | null;
  borrow_photo_path: string | null;
  return_photo_path: string | null;
  student: {
    id: string;
    nim: string;
    name: string;
    profile_photo_path: string | null;
  } | null;
  class: {
    id: string;
    study_program: string;
    cohort_year: number;
    section: string;
    academic_term: string;
  } | null;
  projector: {
    id: string;
    code: string;
    name: string;
    status: string;
  } | null;
  borrow_staff: {
    id: string;
    name: string;
    role: string;
  } | null;
  return_staff: {
    id: string;
    name: string;
    role: string;
  } | null;
}

interface MaintenanceStatusData {
  retention_last_run: {
    last_run_at?: string;
    status?: string;
    deleted_document_photos?: number;
    deleted_face_photos?: number;
    deleted_loan_photos?: number;
    expired_leaders_revoked?: number;
    storage_usage_bytes?: number;
    storage_usage_pct?: number;
    storage_warning_active?: boolean;
    failures?: string[] | null;
  } | null;
  storage_monitoring: {
    current_usage_bytes?: number;
    current_usage_pct?: number;
    warning_active?: boolean;
    warning_threshold_pct?: number;
    max_capacity_bytes?: number;
  } | null;
  academic_term: {
    current_term?: string;
    term_ends_at?: string;
  } | null;
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<SummaryData>({
    total_projectors: 0,
    available_count: 0,
    borrowed_count: 0,
    overdue_count: 0,
    maintenance_count: 0,
  });
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'OVERDUE' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Maintenance & Storage Status
  const [maintenanceData, setMaintenanceData] = useState<MaintenanceStatusData | null>(null);
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);

  // Photo modal state
  const [selectedLoanForPhotos, setSelectedLoanForPhotos] = useState<LoanRecord | null>(null);
  const [photoUrls, setPhotoUrls] = useState<{
    faceUrl: string | null;
    borrowUrl: string | null;
    returnUrl: string | null;
    loading: boolean;
    error: string | null;
  }>({ faceUrl: null, borrowUrl: null, returnUrl: null, loading: false, error: null });

  // Export CSV modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');

  // Logout state
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLogoutError(data.error?.message || 'Gagal memproses keluar akun.');
        setLoggingOut(false);
        return;
      }
      router.push('/login');
      router.refresh();
    } catch {
      setLogoutError('Terjadi gangguan jaringan saat memproses keluar akun.');
      setLoggingOut(false);
    }
  };

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (fromDate) {
        params.set('from', fromDate);
      }
      if (toDate) {
        params.set('to', toDate);
      }
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim());
      }

      const res = await fetch(`/api/admin/loans?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Gagal memuat data buku besar transaksi.');
      } else {
        setSummary(data.summary || {
          total_projectors: 0,
          available_count: 0,
          borrowed_count: 0,
          overdue_count: 0,
          maintenance_count: 0,
        });
        setLoans(data.loans || []);
      }
    } catch {
      setError('Gangguan jaringan saat menghubungi server.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, fromDate, toDate, searchQuery]);

  const fetchMaintenanceStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/maintenance/status');
      const json = await res.json();
      if (res.ok && json.data) {
        setMaintenanceData(json.data);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    fetchLoans();
    fetchMaintenanceStatus();
  }, [fetchLoans, fetchMaintenanceStatus]);

  // Request signed URL saat membuka modal foto
  const openPhotoModal = async (loan: LoanRecord) => {
    setSelectedLoanForPhotos(loan);
    setPhotoUrls({ faceUrl: null, borrowUrl: null, returnUrl: null, loading: true, error: null });

    try {
      const signPath = async (path: string | null | undefined): Promise<string | null> => {
        if (!path) return null;
        const res = await fetch('/api/admin/photos/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
        const json = await res.json();
        return res.ok && json.data?.signedUrl ? json.data.signedUrl : null;
      };

      const [faceUrl, borrowUrl, returnUrl] = await Promise.all([
        signPath(loan.student?.profile_photo_path),
        signPath(loan.borrow_photo_path),
        signPath(loan.return_photo_path),
      ]);

      setPhotoUrls({
        faceUrl,
        borrowUrl,
        returnUrl,
        loading: false,
        error: null,
      });
    } catch {
      setPhotoUrls((prev) => ({
        ...prev,
        loading: false,
        error: 'Gagal membuat signed URL foto atau sesi kedaluwarsa.',
      }));
    }
  };

  const closePhotoModal = () => {
    setSelectedLoanForPhotos(null);
    setPhotoUrls({ faceUrl: null, borrowUrl: null, returnUrl: null, loading: false, error: null });
  };

  const handleExportSubmit = () => {
    const params = new URLSearchParams();
    if (exportFrom) params.set('from', exportFrom);
    if (exportTo) params.set('to', exportTo);
    window.location.href = `/api/admin/export/loans?${params.toString()}`;
    setIsExportModalOpen(false);
  };

  const triggerManualMaintenance = async () => {
    if (!confirm('Jalankan proses pembersihan retensi foto kedaluwarsa dan pemeliharaan sistem sekarang?')) {
      return;
    }

    setMaintenanceRunning(true);
    setMaintenanceMessage(null);

    try {
      const res = await fetch('/api/cron/retention', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setMaintenanceMessage(`Gagal: ${data.error?.message || 'Terjadi kesalahan sistem.'}`);
      } else {
        setMaintenanceMessage('Pembersihan retensi dan pemeliharaan berhasil dijalankan!');
        fetchLoans();
        fetchMaintenanceStatus();
      }
    } catch {
      setMaintenanceMessage('Gangguan jaringan saat memicu pemeliharaan.');
    } finally {
      setMaintenanceRunning(false);
    }
  };

  const storageUsagePct = maintenanceData?.storage_monitoring?.current_usage_pct || 0;
  const isStorageWarning = maintenanceData?.storage_monitoring?.warning_active || storageUsagePct >= 70;

  return (
    <div className="min-h-screen p-6 md:p-8 bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation & Title Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                Panel Petugas & Admin
              </span>
              <h1 className="text-2xl font-bold text-slate-900">Dashboard Buku Besar Digital</h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Pemantauan status proyektor real-time, pelacakan keterlambatan, dan riwayat transaksi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/verifications"
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm"
            >
              Antrean Verifikasi
            </Link>
            <Link
              href="/admin/classes"
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm"
            >
              Manajemen Kelas
            </Link>
            <Link
              href="/admin/projectors"
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm"
            >
              Inventaris Proyektor
            </Link>
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition shadow-sm flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Ekspor CSV
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-medium transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {loggingOut ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></span>
                  Keluar...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Keluar
                </>
              )}
            </button>
          </div>
        </div>

        {logoutError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center justify-between">
            <span>{logoutError}</span>
            <button
              onClick={() => setLogoutError(null)}
              className="text-red-500 hover:text-red-700 font-bold ml-2 text-sm leading-none"
              aria-label="Tutup pesan error"
            >
              ✕
            </button>
          </div>
        )}

        {/* Real-time Summary Metric Cards (FR-12) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Unit Aktif</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{summary.total_projectors}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Seluruh unit non-arsip</p>
          </div>

          <div className="p-4 bg-white rounded-xl border border-emerald-200 shadow-sm bg-gradient-to-br from-white to-emerald-50/30">
            <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Tersedia</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{summary.available_count}</p>
            <p className="text-[11px] text-emerald-600/80 mt-0.5">Siap dipinjam di meja TU</p>
          </div>

          <div className="p-4 bg-white rounded-xl border border-blue-200 shadow-sm bg-gradient-to-br from-white to-blue-50/30">
            <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Sedang Dipinjam</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{summary.borrowed_count}</p>
            <p className="text-[11px] text-blue-600/80 mt-0.5">Dibawa oleh ketua kelas</p>
          </div>

          <div
            onClick={() => setStatusFilter('OVERDUE')}
            className={`p-4 rounded-xl border shadow-sm cursor-pointer transition ${
              summary.overdue_count > 0
                ? 'bg-rose-50 border-rose-300 hover:bg-rose-100/70'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className={`text-xs font-medium uppercase tracking-wide ${summary.overdue_count > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                Terlambat
              </p>
              {summary.overdue_count > 0 && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                </span>
              )}
            </div>
            <p className={`text-2xl font-bold mt-1 ${summary.overdue_count > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {summary.overdue_count}
            </p>
            <p className={`text-[11px] mt-0.5 ${summary.overdue_count > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
              Melewati batas waktu (due_at)
            </p>
          </div>

          <div className="p-4 bg-white rounded-xl border border-amber-200 shadow-sm bg-gradient-to-br from-white to-amber-50/30">
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Dalam Perawatan</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{summary.maintenance_count}</p>
            <p className="text-[11px] text-amber-600/80 mt-0.5">Kendala / sedang diservis</p>
          </div>
        </div>

        {/* Warning Banner if Overdue Units Exist */}
        {summary.overdue_count > 0 && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-100 rounded-lg text-rose-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold">Perhatian: {summary.overdue_count} unit proyektor melewati batas waktu pengembalian!</p>
                <p className="text-xs text-rose-600">Unit belum dikembalikan hingga jam operasional TU hari peminjaman.</p>
              </div>
            </div>
            <button
              onClick={() => setStatusFilter('OVERDUE')}
              className="px-3 py-1.5 bg-rose-600 text-white hover:bg-rose-700 rounded-lg text-xs font-medium transition shadow-sm self-start sm:self-center"
            >
              Tampilkan Hanya Unit Terlambat
            </button>
          </div>
        )}

        {/* Scheduled Maintenance & Storage Quota Monitoring Section (FR-20, NFR-08, NFR-10) */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm0 4h16M9 4v3m6-3v3" />
                </svg>
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-800">Pemeliharaan Terjadwal & Kuota Storage (NFR-10)</h3>
                <p className="text-[11px] text-slate-500">
                  Retensi harian foto kedaluwarsa &amp; pemantauan kapasitas media Supabase Free-Tier (1 GB).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                onClick={triggerManualMaintenance}
                disabled={maintenanceRunning}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className={`w-3.5 h-3.5 ${maintenanceRunning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {maintenanceRunning ? 'Memproses...' : 'Jalankan Retensi Sekarang'}
              </button>
            </div>
          </div>

          {maintenanceMessage && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              {maintenanceMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
            {/* Storage Quota Usage Meter */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Pemakaian Kuota Storage</span>
                <span className={`font-mono font-bold ${isStorageWarning ? 'text-amber-700' : 'text-slate-800'}`}>
                  {storageUsagePct.toFixed(1)}% / 100%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${
                    isStorageWarning ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(storageUsagePct, 100)}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Kapasitas: 1 GB</span>
                {isStorageWarning && (
                  <span className="text-amber-700 font-semibold">Melebihi batas 70%</span>
                )}
              </div>
            </div>

            {/* Last Execution Info */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-700 block">Status Retensi Terakhir</span>
              <p className="text-slate-800">
                Waktu:{' '}
                <span className="font-medium">
                  {maintenanceData?.retention_last_run?.last_run_at
                    ? formatWib(maintenanceData.retention_last_run.last_run_at, 'full')
                    : 'Belum pernah dijalankan'}
                </span>
              </p>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-slate-500">Hasil:</span>
                <span className={`inline-flex px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  maintenanceData?.retention_last_run?.status === 'SUCCESS'
                    ? 'bg-emerald-100 text-emerald-800'
                    : maintenanceData?.retention_last_run?.status === 'PARTIAL_FAILURE'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {maintenanceData?.retention_last_run?.status || 'STANDBY'}
                </span>
              </div>
            </div>

            {/* Routine Schedule & Auto Keep-Alive */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-700 block">Jadwal Rutin Vercel Cron</span>
              <p className="text-slate-800">
                Pukul <span className="font-bold text-slate-900">02:00 WIB</span> setiap hari.
              </p>
              <p className="text-[11px] text-slate-500">
                Menjaga project Supabase Free-Tier tetap aktif (*keep-alive*) dan menghapus dokumen &le; 24 jam &amp; foto transaksi &gt; 180 hari.
              </p>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Status Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Transaksi
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sedang Dipinjam ({summary.borrowed_count})
              </button>
              <button
                onClick={() => setStatusFilter('OVERDUE')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  statusFilter === 'OVERDUE'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-rose-600 hover:text-rose-800'
                }`}
              >
                Terlambat ({summary.overdue_count})
              </button>
              <button
                onClick={() => setStatusFilter('COMPLETED')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Selesai
              </button>
            </div>

            {/* Date Filters & Search */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span>Dari:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-md text-xs text-slate-700 bg-white"
                />
              </div>

              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span>Sampai:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-md text-xs text-slate-700 bg-white"
                />
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari nama, NIM, kode unit..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs w-48 sm:w-60 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <svg
                  className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {(fromDate || toDate || searchQuery || statusFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                    setSearchQuery('');
                    setStatusFilter('ALL');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline px-1"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Ledger Table Section (FR-11) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {error && (
            <div className="p-4 bg-rose-50 border-b border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-blue-600 mb-2"></div>
              <p>Memuat buku besar digital...</p>
            </div>
          ) : loans.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="font-medium text-slate-700">Tidak ada transaksi ditemukan</p>
              <p className="text-xs text-slate-400 mt-1">Coba sesuaikan filter atau kata kunci pencarian Anda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 min-w-[160px]">Waktu Pinjam &amp; Batas</th>
                    <th className="py-3 px-4 min-w-[140px]">Waktu Kembali</th>
                    <th className="py-3 px-4 min-w-[150px]">Peminjam</th>
                    <th className="py-3 px-4 min-w-[140px]">Kelas</th>
                    <th className="py-3 px-4 min-w-[130px]">Proyektor</th>
                    <th className="py-3 px-4 min-w-[110px]">Dokumentasi</th>
                    <th className="py-3 px-4 min-w-[130px]">Pengembali</th>
                    <th className="py-3 px-4 min-w-[130px]">Petugas</th>
                    <th className="py-3 pl-4 pr-6 sm:pr-8 text-center min-w-[140px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {loans.map((loan) => {
                    return (
                      <tr key={loan.id} className="hover:bg-slate-50/80 transition">
                        {/* Waktu Pinjam & Due At */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <p className="font-medium text-slate-900">{formatWib(loan.borrowed_at, 'short')}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-slate-500">
                              Batas: {formatWib(loan.due_at, 'time')}
                            </span>
                            {loan.is_overdue && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                                Terlambat
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Waktu Kembali */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {loan.returned_at ? (
                            <p className="text-slate-700 font-medium">{formatWib(loan.returned_at, 'short')}</p>
                          ) : (
                            <span className="text-slate-400 italic">Belum kembali</span>
                          )}
                        </td>

                        {/* Peminjam (Ketua Kelas) */}
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{loan.student?.name || '-'}</p>
                          <p className="text-slate-500 text-[11px] font-mono">NIM {loan.student?.nim || '-'}</p>
                        </td>

                        {/* Kelas */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {loan.class ? (
                            <div>
                              <p className="font-medium text-slate-800">{loan.class.study_program}</p>
                              <p className="text-slate-500 text-[11px]">
                                {loan.class.cohort_year} - Rombel {loan.class.section}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Proyektor */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px] font-bold text-slate-800 border border-slate-200">
                              {loan.projector?.code || '-'}
                            </span>
                          </div>
                          <p className="text-slate-500 text-[11px] mt-0.5 truncate max-w-[120px]">
                            {loan.projector?.name || '-'}
                          </p>
                        </td>

                        {/* Dokumentasi Foto */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <button
                            onClick={() => openPhotoModal(loan)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition"
                          >
                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Lihat Foto
                          </button>
                        </td>

                        {/* Pengembali */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {loan.returned_by_type ? (
                            <div>
                              <span className="text-slate-700 font-medium">
                                {loan.returned_by_type === 'BORROWER' ? 'Peminjam Sendiri' : 'Perwakilan'}
                              </span>
                              {loan.returned_by_name && (
                                <p className="text-[11px] text-slate-500">Nama: {loan.returned_by_name}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Petugas */}
                        <td className="py-3 px-4 whitespace-nowrap text-[11px]">
                          <p className="text-slate-700">
                            <span className="text-slate-400">Pinjam:</span> {loan.borrow_staff?.name || '-'}
                          </p>
                          {loan.return_staff && (
                            <p className="text-slate-700 mt-0.5">
                              <span className="text-slate-400">Kembali:</span> {loan.return_staff.name}
                            </p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 pl-4 pr-6 sm:pr-8 whitespace-nowrap text-center">
                          {loan.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                              Dipinjam
                            </span>
                          ) : loan.return_condition === 'REPORTED_ISSUE' ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                                Ada Kendala
                              </span>
                              {loan.damage_notes && (
                                <p className="text-[10px] text-amber-700 mt-0.5 max-w-[120px] truncate" title={loan.damage_notes}>
                                  {loan.damage_notes}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                              Selesai
                            </span>
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

      {/* Side-by-Side Photo Comparison Modal (FT-03, FR-11, NFR-07) */}
      {selectedLoanForPhotos && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Dokumentasi Visual Transaksi</h3>
                <p className="text-xs text-slate-500">
                  Perbandingan manual foto wajah referensi, foto serah-terima pinjam, dan foto pengembalian.
                </p>
              </div>
              <button
                onClick={closePhotoModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Invariant Alert */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold">Ketentuan Privasi &amp; Keamanan (NFR-05, NFR-07):</p>
                <p className="mt-0.5">
                  Foto disimpan pada bucket privat dan hanya diakses melalui signed URL berumur 60 detik. Setiap pembukaan tercatat di audit log. Foto murni pembanding visual petugas tanpa algoritma pengenalan wajah otomatis.
                </p>
              </div>
            </div>

            {photoUrls.loading ? (
              <div className="p-12 text-center text-sm text-slate-500">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-blue-600 mb-2"></div>
                <p>Membuat signed URL aman...</p>
              </div>
            ) : photoUrls.error ? (
              <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-center text-xs text-rose-700">
                {photoUrls.error}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {/* 1. Foto Wajah Referensi */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex flex-col items-center">
                  <div className="w-full flex items-center justify-between pb-2 border-b border-slate-200 mb-2">
                    <span className="text-xs font-semibold text-slate-700">1. Wajah Referensi</span>
                    <span className="text-[10px] text-slate-500">Registrasi TU</span>
                  </div>
                  <div className="w-full aspect-[4/3] bg-slate-200 rounded-lg overflow-hidden flex items-center justify-center">
                    {photoUrls.faceUrl ? (
                      <img
                        src={photoUrls.faceUrl}
                        alt="Foto Referensi"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-400 italic">Foto tidak tersedia</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 text-center">
                    {selectedLoanForPhotos.student?.name} (NIM {selectedLoanForPhotos.student?.nim})
                  </p>
                </div>

                {/* 2. Foto Saat Pengambilan Pinjam */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex flex-col items-center">
                  <div className="w-full flex items-center justify-between pb-2 border-b border-slate-200 mb-2">
                    <span className="text-xs font-semibold text-slate-700">2. Foto Pengambilan</span>
                    <span className="text-[10px] text-blue-600 font-medium">Pinjam</span>
                  </div>
                  <div className="w-full aspect-[4/3] bg-slate-200 rounded-lg overflow-hidden flex items-center justify-center">
                    {photoUrls.borrowUrl ? (
                      <img
                        src={photoUrls.borrowUrl}
                        alt="Foto Pengambilan"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-400 italic">Foto tidak tersedia / kedaluwarsa</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 text-center">
                    {formatWib(selectedLoanForPhotos.borrowed_at, 'short')}
                  </p>
                </div>

                {/* 3. Foto Saat Pengembalian */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex flex-col items-center">
                  <div className="w-full flex items-center justify-between pb-2 border-b border-slate-200 mb-2">
                    <span className="text-xs font-semibold text-slate-700">3. Foto Pengembalian</span>
                    <span className="text-[10px] text-emerald-600 font-medium">Kembali</span>
                  </div>
                  <div className="w-full aspect-[4/3] bg-slate-200 rounded-lg overflow-hidden flex items-center justify-center">
                    {photoUrls.returnUrl ? (
                      <img
                        src={photoUrls.returnUrl}
                        alt="Foto Pengembalian"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-400 italic">
                        {selectedLoanForPhotos.status === 'ACTIVE'
                          ? 'Belum dikembalikan'
                          : 'Foto tidak tersedia / terhapus'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 text-center">
                    {selectedLoanForPhotos.returned_at
                      ? formatWib(selectedLoanForPhotos.returned_at, 'short')
                      : '-'}
                  </p>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={closePhotoModal}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-medium transition"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export CSV Modal (FR-10, NFR-10, FT-03) */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Ekspor Buku Besar ke CSV</h3>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Sesuai <span className="font-semibold text-slate-700">NFR-10</span>, ekspor CSV dilakukan minimal mingguan karena basis data free-tier tidak menyediakan cadangan otomatis.
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Dari Tanggal Peminjaman (Opsional):
                </label>
                <input
                  type="date"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Sampai Tanggal Peminjaman (Opsional):
                </label>
                <input
                  type="date"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-800"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
                Format file mencakup UTF-8 BOM dan perlindungan formula injection agar nama dan tanda waktu WIB tampil aman di Microsoft Excel.
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-medium transition"
              >
                Batal
              </button>
              <button
                onClick={handleExportSubmit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Unduh Berkas CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
