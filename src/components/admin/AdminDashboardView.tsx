/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatWib } from '@/lib/timezone';
import { Button, Badge, LoadingSpinner, Card, EmptyState, Input, Modal } from '@/components/ui';
import {
  UserCheck,
  GraduationCap,
  Layers,
  QrCode,
  RefreshCw,
  FileDown,
  LogOut,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Wrench,
  ArrowUpRight,
  Search,
  Calendar,
  RotateCcw,
  X,
  ChevronLeft,
  ChevronRight,
  Camera,
  Filter,
  Database,
  HardDrive,
  PlayCircle,
  FileSpreadsheet,
  FileText,
  Check,
} from 'lucide-react';

export interface SummaryData {
  total_projectors: number;
  available_count: number;
  borrowed_count: number;
  overdue_count: number;
  maintenance_count: number;
}

export interface LoanRecord {
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

export interface MaintenanceStatusData {
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
    last_checked_at?: string;
  } | null;
  academic_term: {
    current_term?: string;
    term_ends_at?: string;
  } | null;
}

/**
 * Memformat identitas pengembali untuk ringkasan dan modal dokumentasi foto (FR-07):
 * 1. Jika status ACTIVE atau belum dikembalikan, tampilkan "-".
 * 2. Jika returned_by_type === "BORROWER", gunakan nama mahasiswa dari relasi data transaksi yang sebenarnya.
 * 3. Jika returned_by_type === "REPRESENTATIVE", gunakan returned_by_name dan tampilkan "{nama} (Perwakilan)".
 * 4. Jika data identitas pengembali tidak tersedia, tampilkan "-".
 * 5. Jangan menggunakan nama mahasiswa sebagai fallback untuk REPRESENTATIVE.
 * 6. Jangan mengarang nama atau mengubah data database.
 */
export function getReturnerDisplayText(loan: {
  status?: string | null;
  returned_at?: string | null;
  returned_by_type?: 'BORROWER' | 'REPRESENTATIVE' | string | null;
  returned_by_name?: string | null;
  student?: {
    name?: string | null;
  } | null;
} | null | undefined): string {
  if (!loan) return '-';

  // 1. Jika status ACTIVE atau belum dikembalikan, tampilkan "-"
  if (loan.status === 'ACTIVE' || !loan.returned_at) {
    return '-';
  }

  // 2. Jika returned_by_type === "BORROWER", gunakan nama mahasiswa dari relasi data transaksi yang sebenarnya
  if (loan.returned_by_type === 'BORROWER') {
    const studentName = loan.student?.name?.trim();
    const explicitName = loan.returned_by_name?.trim();
    return studentName || explicitName || '-';
  }

  // 3. Jika returned_by_type === "REPRESENTATIVE", gunakan returned_by_name dan tampilkan "{nama} (Perwakilan)"
  // 5. Jangan menggunakan nama mahasiswa sebagai fallback untuk REPRESENTATIVE
  if (loan.returned_by_type === 'REPRESENTATIVE') {
    const repName = loan.returned_by_name?.trim();
    if (!repName) {
      return '-';
    }
    return `${repName} (Perwakilan)`;
  }

  // 4. Jika data identitas pengembali tidak tersedia atau tipe tidak dikenal, tampilkan "-"
  const fallbackName = loan.returned_by_name?.trim();
  return fallbackName || '-';
}

/**
 * Format besaran byte menjadi representasi string terbaca (B, KB, MB, GB).
 */
export function formatBytes(bytes?: number): string {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function DamageNotesTooltip({ notes }: { notes: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    placement: 'top' | 'bottom';
  }>({ top: 0, left: 0, placement: 'top' });
  const triggerRef = useRef<HTMLDivElement>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 240;
    const estimatedHeight = 70;

    // Prefer positioning on 'top' so it never obscures the transaction row below.
    // Flip to 'bottom' only if there is not enough space above (< 80px).
    const spaceAbove = rect.top;
    const placement = spaceAbove < estimatedHeight + 10 ? 'bottom' : 'top';

    const top = placement === 'top' ? rect.top - 8 : rect.bottom + 8;

    // Center horizontally relative to trigger, clamped to viewport margins
    let left = rect.left + rect.width / 2;
    const padding = 16;
    const halfWidth = tooltipWidth / 2;
    if (left - halfWidth < padding) {
      left = padding + halfWidth;
    } else if (left + halfWidth > window.innerWidth - padding) {
      left = window.innerWidth - padding - halfWidth;
    }

    setPosition({ top, left, placement });
  }, []);

  const handleMouseEnter = () => {
    calculatePosition();
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  // Re-calculate on window scroll or resize if visible
  useEffect(() => {
    if (!isVisible) return;
    const handleReposition = () => calculatePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [isVisible, calculatePosition]);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      tabIndex={0}
      role="button"
      aria-label="Lihat catatan kendala unit proyektor"
      className="inline-block outline-none"
    >
      <span className="inline-flex items-center gap-1 justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 cursor-help transition hover:bg-amber-100 hover:border-amber-300">
        <AlertTriangle size={13} className="text-amber-600 shrink-0" aria-hidden="true" />
        Ada Kendala
      </span>

      {isVisible && (
        <div
          data-testid="damage-notes-tooltip"
          role="tooltip"
          className="fixed z-50 pointer-events-none transition-opacity duration-150"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform:
              position.placement === 'top'
                ? 'translate(-50%, -100%)'
                : 'translate(-50%, 0%)',
          }}
        >
          <div className="bg-slate-900 text-slate-100 text-xs rounded-lg px-3 py-2 shadow-xl border border-slate-700/80 max-w-[260px] text-left">
            <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Laporan Kendala:</span>
            </div>
            <p className="leading-relaxed text-slate-200 break-words whitespace-pre-wrap">
              {notes}
            </p>
          </div>
          {/* Arrow */}
          <div
            className={`w-0 h-0 border-x-4 border-x-transparent absolute left-1/2 -translate-x-1/2 ${
              position.placement === 'top'
                ? 'top-full border-t-4 border-t-slate-900'
                : 'bottom-full border-b-4 border-b-slate-900'
            }`}
          />
        </div>
      )}
    </div>
  );
}

export interface AdminDashboardViewProps {
  initialSummary?: SummaryData;
  initialLoans?: LoanRecord[];
  initialTotalCount?: number;
  initialMaintenance?: MaintenanceStatusData | null;
  initialMaintenanceError?: string | null;
  initialPhotoModalLoan?: LoanRecord | null;
  initialExportModalOpen?: boolean;
}

export function buildExportUrl(params: { from?: string; to?: string; format?: 'xlsx' | 'csv' }) {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  q.set('format', params.format || 'xlsx');
  return `/api/admin/export/loans?${q.toString()}`;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = function AdminDashboardView({
  initialSummary,
  initialLoans,
  initialTotalCount,
  initialMaintenance,
  initialMaintenanceError,
  initialPhotoModalLoan,
  initialExportModalOpen,
}: AdminDashboardViewProps = {}) {
  const [summary, setSummary] = useState<SummaryData>(
    initialSummary || {
      total_projectors: 0,
      available_count: 0,
      borrowed_count: 0,
      overdue_count: 0,
      maintenance_count: 0,
    }
  );
  const [loans, setLoans] = useState<LoanRecord[]>(initialLoans || []);
  const [loading, setLoading] = useState(initialLoans ? false : true);
  const [error, setError] = useState<string | null>(null);

  // Pagination states (FR-11, Phase 3)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState(
    initialTotalCount ?? initialLoans?.length ?? 0
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'OVERDUE' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Maintenance & Storage Status
  const [maintenanceData, setMaintenanceData] = useState<MaintenanceStatusData | null>(
    initialMaintenance || null
  );
  const [maintenanceError, setMaintenanceError] = useState<string | null>(
    initialMaintenanceError || null
  );
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);

  // Refresh state & concurrency guard
  const isRefreshingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Photo modal state
  const [photoModalLoan, setPhotoModalLoan] = useState<LoanRecord | null>(
    initialPhotoModalLoan || null
  );
  const [photoUrls, setPhotoUrls] = useState<{
    faceUrl: string | null;
    borrowUrl: string | null;
    returnUrl: string | null;
    loading: boolean;
    error: string | null;
  }>({ faceUrl: null, borrowUrl: null, returnUrl: null, loading: false, error: null });

  // Export modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(
    initialExportModalOpen ?? false
  );
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const closeExportModal = useCallback(() => {
    if (exportTimeoutRef.current) {
      clearTimeout(exportTimeoutRef.current);
      exportTimeoutRef.current = null;
    }
    setIsExportModalOpen(false);
    setExportError(null);
    setIsExporting(false);
  }, []);

  // Cleanup timer ekspor saat komponen unmount
  useEffect(() => {
    return () => {
      if (exportTimeoutRef.current) {
        clearTimeout(exportTimeoutRef.current);
        exportTimeoutRef.current = null;
      }
    };
  }, []);

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

  const fetchLoans = useCallback(async (options?: { silent?: boolean; targetPage?: number }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const pageToFetch = options?.targetPage ?? currentPage;
      const offset = (pageToFetch - 1) * pageSize;

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
      params.set('limit', String(pageSize));
      params.set('offset', String(offset));

      const res = await fetch(`/api/admin/loans?${params.toString()}`, {
        cache: 'no-store',
      });
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
        const fetchedLoans = data.loans || [];
        const fetchedTotal = typeof data.total_count === 'number' ? data.total_count : fetchedLoans.length;
        setLoans(fetchedLoans);
        setTotalCount(fetchedTotal);

        // Auto-refresh: Jika jumlah halaman berkurang, sesuaikan currentPage agar tidak mengarah ke halaman kosong
        const computedTotalPages = Math.max(1, Math.ceil(fetchedTotal / pageSize));
        if (pageToFetch > computedTotalPages) {
          setCurrentPage(computedTotalPages);
        }
      }
    } catch {
      setError('Gangguan jaringan saat menghubungi server.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, fromDate, toDate, searchQuery, currentPage, pageSize]);

  const fetchMaintenanceStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/maintenance/status', {
        cache: 'no-store',
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setMaintenanceData(json.data);
        setMaintenanceError(null);
      } else {
        setMaintenanceError(json.error?.message || 'Gagal memuat status pemeliharaan.');
      }
    } catch {
      setMaintenanceError('Gangguan jaringan saat memuat status pemeliharaan.');
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchLoans({ silent: true }),
        fetchMaintenanceStatus(),
      ]);
    } finally {
      setIsRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, [fetchLoans, fetchMaintenanceStatus]);

  useEffect(() => {
    void fetchLoans();
    void fetchMaintenanceStatus();
  }, [fetchLoans, fetchMaintenanceStatus]);

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !isRefreshingRef.current) {
        void refreshDashboard();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [refreshDashboard]);

  // Handlers untuk filter yang mereset pagination ke halaman 1
  const handleStatusFilterChange = (newStatus: 'ALL' | 'ACTIVE' | 'OVERDUE' | 'COMPLETED') => {
    setStatusFilter(newStatus);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleFromDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFromDate(e.target.value);
    setCurrentPage(1);
  };

  const handleToDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setToDate(e.target.value);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setSearchQuery('');
    setStatusFilter('ALL');
    setCurrentPage(1);
  };

  // Request signed URL saat membuka modal foto
  const openPhotoModal = async (loan: LoanRecord) => {
    setPhotoModalLoan(loan);
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
    setPhotoModalLoan(null);
    setPhotoUrls({ faceUrl: null, borrowUrl: null, returnUrl: null, loading: false, error: null });
  };

  const handleExportSubmit = (format: 'xlsx' | 'csv' = exportFormat) => {
    if (isExporting) return;
    setExportError(null);

    // Validasi rentang tanggal jika keduanya diisi
    if (exportFrom && exportTo && exportFrom > exportTo) {
      setExportError('Tanggal mulai tidak boleh lebih besar dari tanggal akhir.');
      return;
    }

    // Bersihkan timer lama jika masih ada
    if (exportTimeoutRef.current) {
      clearTimeout(exportTimeoutRef.current);
      exportTimeoutRef.current = null;
    }

    setIsExporting(true);
    try {
      const url = buildExportUrl({ from: exportFrom, to: exportTo, format });
      window.location.href = url;
      exportTimeoutRef.current = setTimeout(() => {
        exportTimeoutRef.current = null;
        setIsExporting(false);
        closeExportModal();
      }, 500);
    } catch {
      setExportError('Gagal memproses ekspor data transaksi.');
      setIsExporting(false);
    }
  };

  const exportTransactionsToCSV = () => handleExportSubmit('csv');
  const exportTransactionsToExcel = () => handleExportSubmit('xlsx');

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

  const hasStorageError = !!maintenanceError;
  const storageMonitoring = maintenanceData?.storage_monitoring;
  const isStorageMetricAvailable =
    !hasStorageError &&
    typeof storageMonitoring?.current_usage_pct === 'number' &&
    !!storageMonitoring?.last_checked_at;

  const storageUsagePct = isStorageMetricAvailable ? storageMonitoring.current_usage_pct! : 0;
  const isStorageWarning =
    isStorageMetricAvailable && (storageMonitoring.warning_active || storageUsagePct >= 70);

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-canvas text-main">
      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto space-y-6">
        {/* Navigation & Title Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between pb-5 border-b border-borderline gap-5">
          <div className="space-y-1.5">
            <div>
              <Badge variant="primary" size="sm">
                Panel Petugas &amp; Admin
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-900 tracking-tight">
              Dashboard Admin
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-xl leading-relaxed">
              Pantau inventaris proyektor, aktivitas peminjaman, dan pengembalian secara real-time.
            </p>
          </div>

          {/* Toolbar Navigasi & Aksi */}
          <div className="flex flex-col gap-2.5">
            {/* Kelompok 1: Navigasi Halaman */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              <Link
                href="/admin/verifications"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-element border border-borderline bg-surface hover:bg-slate-50 text-main text-xs font-semibold shadow-sm transition-all active:scale-[0.99] min-h-[40px] sm:min-h-[36px]"
              >
                <UserCheck size={14} className="text-slate-500 shrink-0" />
                <span className="truncate">Antrean Verifikasi</span>
              </Link>
              <Link
                href="/admin/classes"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-element border border-borderline bg-surface hover:bg-slate-50 text-main text-xs font-semibold shadow-sm transition-all active:scale-[0.99] min-h-[40px] sm:min-h-[36px]"
              >
                <GraduationCap size={14} className="text-slate-500 shrink-0" />
                <span className="truncate">Manajemen Kelas</span>
              </Link>
              <Link
                href="/admin/projectors"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-element border border-borderline bg-surface hover:bg-slate-50 text-main text-xs font-semibold shadow-sm transition-all active:scale-[0.99] min-h-[40px] sm:min-h-[36px]"
              >
                <Layers size={14} className="text-slate-500 shrink-0" />
                <span className="truncate">Inventaris Proyektor</span>
              </Link>
              <Link
                href="/kiosk"
                title="Buka antarmuka pemindaian Kiosk meja TU"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-element bg-slate-900 hover:bg-navy-900 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.99] min-h-[40px] sm:min-h-[36px]"
              >
                <QrCode size={14} aria-hidden="true" className="text-brand-secondary shrink-0" />
                <span className="truncate">Buka Kiosk</span>
              </Link>
            </div>

            {/* Kelompok 2: Tombol Aksi */}
            <div className="flex items-center justify-end gap-2 pt-1 sm:pt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshDashboard()}
                disabled={loading || isRefreshing}
                leftIcon={
                  <RefreshCw
                    size={14}
                    className={`text-slate-500 ${loading || isRefreshing ? 'animate-spin text-brand-primary' : ''}`}
                  />
                }
                title="Perbarui data buku besar dan ringkasan inventaris terbaru dari server"
                className="flex-1 sm:flex-initial min-h-[40px] sm:min-h-[36px]"
              >
                {loading || isRefreshing ? 'Memuat...' : 'Muat Ulang'}
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsExportModalOpen(true)}
                leftIcon={<FileDown size={14} className="shrink-0" />}
                className="flex-1 sm:flex-initial min-h-[40px] sm:min-h-[36px] bg-brand-primary hover:bg-blue-700"
              >
                Ekspor Data
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                disabled={loggingOut}
                leftIcon={
                  loggingOut ? (
                    <LoadingSpinner size="sm" variant="neutral" />
                  ) : (
                    <LogOut size={14} className="text-rose-600 shrink-0" />
                  )
                }
                className="bg-white border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 focus:ring-rose-500/20 active:bg-rose-100/70 min-h-[40px] sm:min-h-[36px] shadow-sm flex-1 sm:flex-initial"
              >
                {loggingOut ? 'Keluar...' : 'Keluar'}
              </Button>
            </div>
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

        {/* Real-time Summary Metric Cards (FR-12, UAT Phase 3) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          {/* Card 1: Total Unit Aktif -> /admin/projectors */}
          <button
            type="button"
            data-testid="summary-card-total"
            onClick={() => router.push('/admin/projectors')}
            className="p-4 sm:p-5 rounded-card border border-borderline bg-surface shadow-sm text-left cursor-pointer transition-all duration-150 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-navy-800/20 group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-navy-50 text-navy-800">
                  <Layers size={16} />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-navy-900 transition-colors">
                  Total Unit Aktif
                </p>
              </div>
              <ArrowUpRight size={15} className="text-slate-300 group-hover:text-navy-800 transition-colors" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-navy-900 mt-2.5 tracking-tight">
              {summary.total_projectors}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Seluruh unit non-arsip</p>
          </button>

          {/* Card 2: Tersedia -> /admin/projectors?status=AVAILABLE */}
          <button
            type="button"
            data-testid="summary-card-available"
            onClick={() => router.push('/admin/projectors?status=AVAILABLE')}
            className="p-4 sm:p-5 rounded-card border border-borderline hover:border-emerald-300 bg-surface shadow-sm text-left cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={16} />
                </div>
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider group-hover:text-emerald-800 transition-colors">
                  Tersedia
                </p>
              </div>
              <ArrowUpRight size={15} className="text-slate-300 group-hover:text-emerald-700 transition-colors" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 mt-2.5 tracking-tight">
              {summary.available_count}
            </p>
            <p className="text-[11px] text-emerald-700/80 mt-1">Siap dipinjam di meja TU</p>
          </button>

          {/* Card 3: Sedang Dipinjam -> filter status=ACTIVE */}
          <button
            type="button"
            data-testid="summary-card-borrowed"
            onClick={() => handleStatusFilterChange('ACTIVE')}
            className={`p-4 sm:p-5 rounded-card border shadow-sm text-left cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 group ${
              statusFilter === 'ACTIVE'
                ? 'bg-brand-soft/60 border-brand-primary ring-2 ring-brand-primary/20 shadow-md'
                : 'bg-surface border-borderline hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 text-brand-primary">
                  <Clock size={16} />
                </div>
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                  Sedang Dipinjam
                </p>
              </div>
              {statusFilter === 'ACTIVE' ? (
                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-primary text-white">
                  Filter Aktif
                </span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary/40 group-hover:bg-brand-primary transition-colors" />
              )}
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-blue-700 mt-2.5 tracking-tight">
              {summary.borrowed_count}
            </p>
            <p className="text-[11px] text-blue-600/80 mt-1">Dibawa oleh ketua kelas</p>
          </button>

          {/* Card 4: Terlambat -> filter status=OVERDUE */}
          <button
            type="button"
            data-testid="summary-card-overdue"
            onClick={() => handleStatusFilterChange('OVERDUE')}
            className={`p-4 sm:p-5 rounded-card border shadow-sm text-left cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-rose-500/20 group ${
              statusFilter === 'OVERDUE'
                ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-500/20 shadow-md'
                : summary.overdue_count > 0
                ? 'bg-rose-50/40 border-rose-200 hover:border-rose-300'
                : 'bg-surface border-borderline hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${summary.overdue_count > 0 || statusFilter === 'OVERDUE' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                  <AlertTriangle size={16} />
                </div>
                <p className={`text-xs font-bold uppercase tracking-wider ${summary.overdue_count > 0 || statusFilter === 'OVERDUE' ? 'text-rose-700' : 'text-slate-500'}`}>
                  Terlambat
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {statusFilter === 'OVERDUE' && (
                  <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">
                    Filter Aktif
                  </span>
                )}
                {summary.overdue_count > 0 && statusFilter !== 'OVERDUE' && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                  </span>
                )}
              </div>
            </div>
            <p className={`text-2xl sm:text-3xl font-extrabold mt-2.5 tracking-tight ${summary.overdue_count > 0 || statusFilter === 'OVERDUE' ? 'text-rose-700' : 'text-navy-900'}`}>
              {summary.overdue_count}
            </p>
            <p className={`text-[11px] mt-1 ${summary.overdue_count > 0 || statusFilter === 'OVERDUE' ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>
              Melewati batas waktu (due_at)
            </p>
          </button>

          {/* Card 5: Dalam Perawatan -> /admin/projectors?status=MAINTENANCE (col-span-2 md:col-span-1) */}
          <button
            type="button"
            data-testid="summary-card-maintenance"
            onClick={() => router.push('/admin/projectors?status=MAINTENANCE')}
            className="p-4 sm:p-5 rounded-card border border-borderline hover:border-amber-300 bg-surface shadow-sm text-left cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-amber-500/20 group col-span-2 md:col-span-1"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
                  <Wrench size={16} />
                </div>
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider group-hover:text-amber-800 transition-colors">
                  Dalam Perawatan
                </p>
              </div>
              <ArrowUpRight size={15} className="text-slate-300 group-hover:text-amber-700 transition-colors" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-700 mt-2.5 tracking-tight">
              {summary.maintenance_count}
            </p>
            <p className="text-[11px] text-amber-700/80 mt-1">Kendala / sedang diservis</p>
          </button>
        </div>

        {/* Warning Banner if Overdue Units Exist */}
        {summary.overdue_count > 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200/90 rounded-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-element text-amber-800 shrink-0">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Perhatian: {summary.overdue_count} unit proyektor melewati batas waktu pengembalian!
                </p>
                <p className="text-xs text-amber-700">
                  Unit belum dikembalikan hingga jam operasional TU hari peminjaman.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusFilterChange('OVERDUE')}
              className="bg-amber-600 hover:bg-amber-700 text-white border-transparent hover:text-white shadow-sm shrink-0 self-start sm:self-center"
            >
              Tampilkan Hanya Unit Terlambat
            </Button>
          </div>
        )}

        {/* Scheduled Maintenance & Storage Quota Monitoring Section (FR-20, NFR-08, NFR-10) */}
        <Card variant="default" padding="sm" className="space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-borderline/70">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-navy-50 text-navy-800 rounded-element border border-navy-100/60 shrink-0">
                <Database className="w-4 h-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-main">Pemeliharaan Terjadwal &amp; Kuota Storage (NFR-10)</h3>
                <p className="text-[11px] text-muted">
                  Retensi harian foto kedaluwarsa &amp; pemantauan kapasitas media Supabase Free-Tier (1 GB).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <Button
                variant="outline"
                size="sm"
                onClick={triggerManualMaintenance}
                disabled={maintenanceRunning}
                isLoading={maintenanceRunning}
                loadingText="Memproses..."
                leftIcon={!maintenanceRunning ? <PlayCircle className="w-3.5 h-3.5 text-navy-800" aria-hidden="true" /> : undefined}
                className="self-start sm:self-center"
              >
                Jalankan Retensi Sekarang
              </Button>
            </div>
          </div>

          {maintenanceMessage && (
            <div className="p-2.5 bg-brand-soft/60 border border-blue-200/80 rounded-element text-xs text-brand-primary flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-primary" aria-hidden="true" />
              <span>{maintenanceMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 text-xs pt-0.5">
            {/* Storage Quota Usage Meter */}
            <div className="p-3 bg-canvas rounded-card border border-borderline/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-main">
                  <HardDrive className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
                  <span>Pemakaian Kuota Storage</span>
                </div>
                {hasStorageError ? (
                  <Badge variant="danger" size="sm">Gagal Memuat</Badge>
                ) : !isStorageMetricAvailable ? (
                  <Badge variant="neutral" size="sm">Belum Dihitung</Badge>
                ) : (
                  <span className={`font-mono font-bold ${isStorageWarning ? 'text-amber-700' : 'text-main'}`}>
                    {storageUsagePct.toFixed(1)}% / 100%
                  </span>
                )}
              </div>
              <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    !isStorageMetricAvailable
                      ? 'w-0'
                      : isStorageWarning
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: isStorageMetricAvailable ? `${Math.min(storageUsagePct, 100)}%` : '0%' }}
                ></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted">
                {hasStorageError ? (
                  <>
                    <span className="text-rose-600 font-medium">Gagal memuat metrik storage</span>
                    <span>Kapasitas: 1 GB</span>
                  </>
                ) : !isStorageMetricAvailable ? (
                  <>
                    <span>Kapasitas: 1 GB</span>
                    <span className="italic text-slate-500">Metrik belum tersedia</span>
                  </>
                ) : (
                  <>
                    <span>
                      {storageMonitoring?.current_usage_bytes !== undefined
                        ? `${formatBytes(storageMonitoring.current_usage_bytes)} / ${formatBytes(storageMonitoring?.max_capacity_bytes || 1073741824)}`
                        : `Kapasitas: ${formatBytes(storageMonitoring?.max_capacity_bytes || 1073741824)}`}
                    </span>
                    {isStorageWarning ? (
                      <span className="text-amber-700 font-semibold">Melebihi batas 70%</span>
                    ) : storageMonitoring?.last_checked_at ? (
                      <span>Pemeriksaan: {formatWib(storageMonitoring.last_checked_at, 'short')}</span>
                    ) : null}
                  </>
                )}
              </div>
              {!isStorageMetricAvailable && !hasStorageError && (
                <p className="text-[10px] text-slate-400 pt-0.5">
                  Dihitung otomatis saat retensi harian atau klik &ldquo;Jalankan Retensi Sekarang&rdquo;.
                </p>
              )}
            </div>

            {/* Last Execution Info */}
            <div className="p-3 bg-canvas rounded-card border border-borderline/80 space-y-1.5">
              <span className="font-semibold text-main block">Status Retensi Terakhir</span>
              <p className="text-main text-[11px] sm:text-xs">
                Waktu:{' '}
                <span className="font-medium text-slate-800">
                  {maintenanceData?.retention_last_run?.last_run_at
                    ? formatWib(maintenanceData.retention_last_run.last_run_at, 'full')
                    : 'Belum pernah dijalankan'}
                </span>
              </p>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-muted">Hasil:</span>
                <Badge
                  variant={
                    maintenanceData?.retention_last_run?.status === 'SUCCESS'
                      ? 'success'
                      : maintenanceData?.retention_last_run?.status === 'PARTIAL_FAILURE'
                      ? 'warning'
                      : 'neutral'
                  }
                  size="sm"
                >
                  {maintenanceData?.retention_last_run?.status || 'STANDBY'}
                </Badge>
              </div>
            </div>

            {/* Routine Schedule & Auto Keep-Alive */}
            <div className="p-3 bg-canvas rounded-card border border-borderline/80 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-main">
                <Clock className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                <span>Jadwal Rutin Vercel Cron</span>
              </div>
              <p className="text-main text-[11px] sm:text-xs">
                Pukul <span className="font-bold text-slate-900">02:00 WIB</span> setiap hari.
              </p>
              <p className="text-[11px] text-muted leading-relaxed">
                Menjaga project Supabase Free-Tier tetap aktif (<em>keep-alive</em>) dan menghapus dokumen &le; 24 jam &amp; foto transaksi &gt; 180 hari.
              </p>
            </div>
          </div>
        </Card>

        {/* Filter & Search Bar (Fase 2.2 Balanced Navy Modern Redesign) */}
        <Card variant="default" padding="sm" className="space-y-3.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
            {/* Status Tabs with Neutral/Canvas Track */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-canvas rounded-element border border-borderline/70 text-xs">
              <button
                type="button"
                onClick={() => handleStatusFilterChange('ALL')}
                className={`px-3 py-1.5 rounded-button text-xs font-semibold transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-navy-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-navy-900 hover:bg-slate-200/50'
                }`}
              >
                Semua Transaksi
              </button>
              <button
                type="button"
                onClick={() => handleStatusFilterChange('ACTIVE')}
                className={`px-3 py-1.5 rounded-button text-xs font-semibold transition-all ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-navy-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-navy-900 hover:bg-slate-200/50'
                }`}
              >
                Sedang Dipinjam ({summary.borrowed_count})
              </button>
              <button
                type="button"
                onClick={() => handleStatusFilterChange('OVERDUE')}
                className={`px-3 py-1.5 rounded-button text-xs font-semibold transition-all ${
                  statusFilter === 'OVERDUE'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                }`}
              >
                Terlambat ({summary.overdue_count})
              </button>
              <button
                type="button"
                onClick={() => handleStatusFilterChange('COMPLETED')}
                className={`px-3 py-1.5 rounded-button text-xs font-semibold transition-all ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-navy-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-navy-900 hover:bg-slate-200/50'
                }`}
              >
                Selesai
              </button>
            </div>

            {/* Date Filters & Search */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Date Filter: Dari */}
              <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-canvas px-2.5 py-1.5 rounded-element border border-borderline shadow-xs">
                <Calendar size={13} className="text-slate-400 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-500">Dari:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={handleFromDateChange}
                  className="bg-transparent text-xs text-main font-medium focus:outline-none cursor-pointer"
                  title="Filter tanggal mulai peminjaman"
                />
              </div>

              {/* Date Filter: Sampai */}
              <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-canvas px-2.5 py-1.5 rounded-element border border-borderline shadow-xs">
                <Calendar size={13} className="text-slate-400 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-500">Sampai:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={handleToDateChange}
                  className="bg-transparent text-xs text-main font-medium focus:outline-none cursor-pointer"
                  title="Filter tanggal akhir peminjaman"
                />
              </div>

              {/* Search Input with Lucide Search & Clear Button */}
              <div className="relative w-full sm:w-60">
                <Input
                  type="text"
                  placeholder="Cari nama, NIM, kode unit..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  leftIcon={<Search size={14} className="text-slate-400 shrink-0" />}
                  rightIcon={
                    searchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setCurrentPage(1);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 focus:outline-none"
                        title="Hapus kata kunci pencarian"
                      >
                        <X size={13} />
                      </button>
                    ) : undefined
                  }
                  className="min-h-[38px] py-1.5 text-xs bg-surface border-borderline focus:border-brand-primary"
                  containerClassName="w-full"
                />
              </div>

              {/* Reset Button (when active) */}
              {(fromDate || toDate || searchQuery || statusFilter !== 'ALL') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  leftIcon={<RotateCcw size={13} className="text-slate-500 shrink-0" />}
                  className="min-h-[38px] text-xs font-semibold text-slate-600 hover:text-navy-900 border-borderline"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Active Filter Chips */}
          {(fromDate || toDate || searchQuery || statusFilter !== 'ALL') && (
            <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-borderline/60 text-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Filter size={12} className="text-slate-400" />
                Filter Aktif:
              </span>

              {statusFilter !== 'ALL' && (
                <Badge
                  size="sm"
                  variant={statusFilter === 'OVERDUE' ? 'danger' : 'primary'}
                  className="gap-1.5 pl-2.5 pr-1.5 py-0.5"
                >
                  <span>
                    Status:{' '}
                    {statusFilter === 'ACTIVE'
                      ? 'Sedang Dipinjam'
                      : statusFilter === 'OVERDUE'
                      ? 'Terlambat'
                      : 'Selesai'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleStatusFilterChange('ALL')}
                    className="p-0.5 rounded-full hover:bg-black/10 focus:outline-none"
                    title="Hapus filter status"
                  >
                    <X size={11} />
                  </button>
                </Badge>
              )}

              {fromDate && (
                <Badge size="sm" variant="neutral" className="gap-1.5 pl-2.5 pr-1.5 py-0.5">
                  <span>Dari: {fromDate}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFromDate('');
                      setCurrentPage(1);
                    }}
                    className="p-0.5 rounded-full hover:bg-black/10 focus:outline-none"
                    title="Hapus batas tanggal mulai"
                  >
                    <X size={11} />
                  </button>
                </Badge>
              )}

              {toDate && (
                <Badge size="sm" variant="neutral" className="gap-1.5 pl-2.5 pr-1.5 py-0.5">
                  <span>Sampai: {toDate}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setToDate('');
                      setCurrentPage(1);
                    }}
                    className="p-0.5 rounded-full hover:bg-black/10 focus:outline-none"
                    title="Hapus batas tanggal akhir"
                  >
                    <X size={11} />
                  </button>
                </Badge>
              )}

              {searchQuery && (
                <Badge size="sm" variant="neutral" className="gap-1.5 pl-2.5 pr-1.5 py-0.5">
                  <span>Cari: &quot;{searchQuery}&quot;</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="p-0.5 rounded-full hover:bg-black/10 focus:outline-none"
                    title="Hapus kata kunci"
                  >
                    <X size={11} />
                  </button>
                </Badge>
              )}

              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline ml-1"
              >
                Hapus Semua Filter
              </button>
            </div>
          )}
        </Card>

        {/* Ledger Table Section (FR-11, Mobile & Desktop Responsive) */}
        <div className="bg-surface rounded-card border border-borderline shadow-sm overflow-hidden">
          {error && (
            <div className="p-4 bg-rose-50 border-b border-rose-200 text-xs text-rose-700 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchLoans()}
                className="text-xs py-1 px-3 h-7 min-h-0 bg-white border-rose-300 text-rose-700 hover:bg-rose-100/70"
              >
                Coba Lagi
              </Button>
            </div>
          )}

          {loading ? (
            <div className="p-12 sm:p-16 text-center text-sm text-slate-500 flex flex-col items-center justify-center space-y-3">
              <LoadingSpinner size="lg" variant="primary" />
              <p className="text-xs sm:text-sm font-medium text-slate-600">Memuat buku besar digital...</p>
            </div>
          ) : loans.length === 0 ? (
            <div className="p-6 sm:p-10">
              <EmptyState
                icon={<Layers size={24} className="text-brand-primary" />}
                title="Tidak ada transaksi ditemukan"
                description="Coba sesuaikan filter atau kata kunci pencarian Anda."
                action={
                  (fromDate || toDate || searchQuery || statusFilter !== 'ALL') ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetFilters}
                      leftIcon={<RotateCcw size={13} />}
                    >
                      Reset Filter
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              {/* Desktop View: Full Responsive Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[980px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-canvas border-b border-borderline text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 pl-4 pr-3 w-[155px]">Waktu Pinjam &amp; Batas</th>
                      <th className="py-3.5 px-3 w-[135px]">Waktu Kembali</th>
                      <th className="py-3.5 px-3 w-[150px]">Peminjam</th>
                      <th className="py-3.5 px-3 w-[140px]">Kelas</th>
                      <th className="py-3.5 px-3 w-[125px]">Proyektor</th>
                      <th className="py-3.5 px-3 w-[105px] text-center">Dokumentasi</th>
                      <th className="py-3.5 px-3 w-[130px]">Pengembali</th>
                      <th className="py-3.5 px-3 w-[135px]">Petugas</th>
                      <th className="py-3.5 pl-3 pr-6 text-center w-[125px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderline/70 text-main">
                    {loans.map((loan) => {
                      return (
                        <tr key={loan.id} className="hover:bg-slate-50/70 transition-colors" data-testid="desktop-loan-row">
                          {/* Waktu Pinjam & Due At */}
                          <td className="py-3.5 pl-4 pr-3 whitespace-nowrap">
                            <p className="font-semibold text-navy-900">{formatWib(loan.borrowed_at, 'short')}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[11px] text-slate-500 font-medium">
                                Batas: {formatWib(loan.due_at, 'time')}
                              </span>
                              {loan.is_overdue && (
                                <Badge variant="danger" size="sm">
                                  Terlambat
                                </Badge>
                              )}
                            </div>
                          </td>

                          {/* Waktu Kembali */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            {loan.returned_at ? (
                              <p className="text-slate-800 font-medium">{formatWib(loan.returned_at, 'short')}</p>
                            ) : (
                              <span className="text-slate-400 italic">Belum kembali</span>
                            )}
                          </td>

                          {/* Peminjam (Ketua Kelas) */}
                          <td className="py-3.5 px-3">
                            <p className="font-bold text-navy-900 leading-tight">{loan.student?.name || '-'}</p>
                            <p className="text-slate-500 text-[11px] font-mono mt-0.5">NIM {loan.student?.nim || '-'}</p>
                          </td>

                          {/* Kelas */}
                          <td className="py-3.5 px-3">
                            {loan.class ? (
                              <div>
                                <p className="font-semibold text-slate-800 leading-tight">{loan.class.study_program}</p>
                                <p className="text-slate-500 text-[11px] mt-0.5">
                                  {loan.class.cohort_year} - Rombel {loan.class.section}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* Proyektor */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-canvas font-mono text-[11px] font-bold text-navy-900 border border-borderline whitespace-nowrap">
                                {loan.projector?.code || '-'}
                              </span>
                            </div>
                            <p className="text-slate-500 text-[11px] mt-0.5 truncate max-w-[120px]" title={loan.projector?.name || ''}>
                              {loan.projector?.name || '-'}
                            </p>
                          </td>

                          {/* Dokumentasi Foto */}
                          <td className="py-3.5 px-3 whitespace-nowrap text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openPhotoModal(loan)}
                              leftIcon={<Camera size={13} className="text-slate-500 shrink-0" />}
                              className="text-xs py-1 px-2.5 min-h-[32px] font-medium border-borderline hover:bg-slate-50"
                            >
                              Lihat Foto
                            </Button>
                          </td>

                          {/* Pengembali */}
                          <td className="py-3.5 px-3">
                            {loan.returned_by_type ? (
                              <div>
                                <span className="text-slate-800 font-medium">
                                  {loan.returned_by_type === 'BORROWER' ? 'Peminjam Sendiri' : 'Perwakilan'}
                                </span>
                                {loan.returned_by_name && (
                                  <p className="text-[11px] text-slate-500 truncate max-w-[120px]" title={loan.returned_by_name}>
                                    Nama: {loan.returned_by_name}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* Petugas */}
                          <td className="py-3.5 px-3 text-[11px]">
                            <p className="text-slate-700 truncate" title={loan.borrow_staff?.name || ''}>
                              <span className="text-slate-400 font-medium">Pinjam:</span> {loan.borrow_staff?.name || '-'}
                            </p>
                            {loan.return_staff && (
                              <p className="text-slate-700 mt-0.5 truncate" title={loan.return_staff.name}>
                                <span className="text-slate-400 font-medium">Kembali:</span> {loan.return_staff.name}
                              </p>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 pl-3 pr-6 whitespace-nowrap text-center">
                            {loan.status === 'ACTIVE' ? (
                              <Badge variant="primary" dot size="sm">
                                Dipinjam
                              </Badge>
                            ) : loan.return_condition === 'REPORTED_ISSUE' ? (
                              loan.damage_notes ? (
                                <DamageNotesTooltip notes={loan.damage_notes} />
                              ) : (
                                <Badge variant="warning" dot size="sm">
                                  Ada Kendala
                                </Badge>
                              )
                            ) : (
                              <Badge variant="success" dot size="sm">
                                Selesai
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile View: Transaction Cards (Optimized for Small Screens) */}
              <div className="block md:hidden divide-y divide-borderline" data-testid="mobile-loans-list">
                {loans.map((loan) => (
                  <div key={loan.id} className="p-4 space-y-3 hover:bg-slate-50/50 transition-colors" data-testid="mobile-loan-card">
                    {/* Header: Proyektor & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-canvas font-mono text-xs font-bold text-navy-900 border border-borderline">
                            {loan.projector?.code || '-'}
                          </span>
                          <span className="text-xs font-bold text-main truncate max-w-[150px]">
                            {loan.projector?.name || '-'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Pinjam: <span className="font-medium text-slate-700">{formatWib(loan.borrowed_at, 'short')}</span>
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {loan.status === 'ACTIVE' ? (
                          <Badge variant="primary" dot size="sm">
                            Dipinjam
                          </Badge>
                        ) : loan.return_condition === 'REPORTED_ISSUE' ? (
                          <Badge variant="warning" dot size="sm">
                            Ada Kendala
                          </Badge>
                        ) : (
                          <Badge variant="success" dot size="sm">
                            Selesai
                          </Badge>
                        )}
                        {loan.is_overdue && (
                          <Badge variant="danger" size="sm">
                            Terlambat
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Borrower & Class */}
                    <div className="p-2.5 bg-canvas border border-borderline rounded-element text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-navy-900">{loan.student?.name || '-'}</span>
                        <span className="text-slate-500 font-mono text-[11px]">NIM {loan.student?.nim || '-'}</span>
                      </div>
                      {loan.class && (
                        <p className="text-[11px] text-slate-600">
                          {loan.class.study_program} ({loan.class.cohort_year} - Rombel {loan.class.section})
                        </p>
                      )}
                    </div>

                    {/* Timing: Batas & Waktu Kembali */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div className="p-2 bg-canvas/80 rounded-element border border-borderline">
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">Batas Kembali:</span>
                        <span className="font-bold text-navy-900">{formatWib(loan.due_at, 'time')}</span>
                      </div>
                      <div className="p-2 bg-canvas/80 rounded-element border border-borderline">
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">Waktu Kembali:</span>
                        <span className="font-bold text-navy-900">
                          {loan.returned_at ? formatWib(loan.returned_at, 'short') : 'Belum kembali'}
                        </span>
                      </div>
                    </div>

                    {/* Staff & Returner info if returned */}
                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      {loan.returned_at && (
                        <p>
                          <span className="text-slate-400 font-medium">Pengembali:</span>{' '}
                          <span className="font-semibold text-slate-700">
                            {getReturnerDisplayText(loan)}
                          </span>
                        </p>
                      )}
                      <p>
                        <span className="text-slate-400 font-medium">Petugas:</span>{' '}
                        <span>Pinjam: {loan.borrow_staff?.name || '-'}</span>
                        {loan.return_staff && <span> • Kembali: {loan.return_staff.name}</span>}
                      </p>
                    </div>

                    {/* Catatan Kendala Mobile (Dapat dibaca langsung tanpa hover) */}
                    {loan.return_condition === 'REPORTED_ISSUE' && loan.damage_notes && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-element text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <AlertTriangle size={14} className="shrink-0 text-amber-700" />
                          <span>Catatan Kendala:</span>
                        </div>
                        <p className="text-amber-900 leading-relaxed break-words font-medium" data-testid="mobile-damage-notes">
                          {loan.damage_notes}
                        </p>
                      </div>
                    )}

                    {/* Action button: Lihat Foto (Touch Friendly) */}
                    <div className="pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPhotoModal(loan)}
                        leftIcon={<Camera size={14} className="text-slate-500 shrink-0" />}
                        className="w-full justify-center min-h-[38px] text-xs font-semibold border-borderline hover:bg-slate-50 shadow-xs"
                      >
                        Lihat Foto Dokumentasi
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Server-Side Pagination Bar (FR-11, Phase 3) */}
              {totalCount > 0 && (
                <div
                  data-testid="pagination-bar"
                  className="px-4 py-3 bg-canvas border-t border-borderline flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="text-slate-600 text-center sm:text-left">
                    Menampilkan <span className="font-semibold text-slate-900">{(currentPage - 1) * pageSize + 1}</span>
                    –<span className="font-semibold text-slate-900">{Math.min(currentPage * pageSize, totalCount)}</span>
                    {' '}dari <span className="font-semibold text-slate-900">{totalCount}</span> transaksi
                  </div>

                  <div className="flex items-center justify-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="pagination-prev"
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage <= 1 || loading}
                      leftIcon={<ChevronLeft size={14} className="shrink-0" />}
                      className="h-8 px-2.5 text-xs font-semibold border-borderline disabled:opacity-40"
                    >
                      Sebelumnya
                    </Button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => {
                          if (totalPages <= 7) return true;
                          if (p === 1 || p === totalPages) return true;
                          return Math.abs(p - currentPage) <= 1;
                        })
                        .map((pageNum, idx, arr) => {
                          const prevPage = arr[idx - 1];
                          const showEllipsis = prevPage && pageNum - prevPage > 1;

                          return (
                            <React.Fragment key={pageNum}>
                              {showEllipsis && (
                                <span className="px-1 text-slate-400 font-bold select-none">…</span>
                              )}
                              <button
                                type="button"
                                data-testid={`pagination-page-${pageNum}`}
                                onClick={() => setCurrentPage(pageNum)}
                                disabled={loading}
                                className={`min-w-[32px] h-8 px-2 text-xs font-bold rounded-element border transition-all ${
                                  currentPage === pageNum
                                    ? 'bg-navy-900 text-white border-navy-900 shadow-sm'
                                    : 'bg-surface border-borderline text-main hover:bg-slate-100 hover:text-navy-900'
                                }`}
                              >
                                {pageNum}
                              </button>
                            </React.Fragment>
                          );
                        })}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="pagination-next"
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage >= totalPages || loading}
                      rightIcon={<ChevronRight size={14} className="shrink-0" />}
                      className="h-8 px-2.5 text-xs font-semibold border-borderline disabled:opacity-40"
                    >
                      Berikutnya
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Side-by-Side Photo Comparison Modal (FT-03, FR-11, NFR-07) */}
      <Modal
        isOpen={!!photoModalLoan}
        onClose={closePhotoModal}
        size="xl"
        title="Dokumentasi Foto Transaksi"
        description="Perbandingan manual foto wajah referensi, foto serah-terima pinjam, dan foto pengembalian."
        footer={
          photoModalLoan ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <p className="text-[11px] text-muted flex items-center gap-1.5">
                <span className="shrink-0">🔒</span>
                <span>Foto disimpan di bucket privat dan hanya diakses melalui signed URL sementara (60 detik).</span>
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={closePhotoModal}
                className="self-end sm:self-auto shrink-0"
              >
                Tutup
              </Button>
            </div>
          ) : undefined
        }
      >
        {photoModalLoan && (
          <div className="space-y-4">
            {/* Informasi Detail Transaksi */}
            <div className="p-3 bg-canvas rounded-card border border-borderline text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-main">
                  Unit: {photoModalLoan.projector?.code} ({photoModalLoan.projector?.name})
                </span>
                <span className="text-muted">
                  Pinjam: {formatWib(photoModalLoan.borrowed_at, 'full')}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-700">
                  Peminjam: {photoModalLoan.student?.name} (NIM {photoModalLoan.student?.nim})
                </span>
                <span className="text-slate-700">
                  Pengembali: {getReturnerDisplayText(photoModalLoan)}
                </span>
              </div>
            </div>

            {/* Error Message */}
            {photoUrls.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-card text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" aria-hidden="true" />
                <span>{photoUrls.error}</span>
              </div>
            )}

            {/* Loading Spinner State */}
            {photoUrls.loading ? (
              <div className="py-12 text-center text-sm text-muted space-y-2">
                <LoadingSpinner size="md" variant="navy" className="mx-auto" />
                <p>Membuat signed URL aman untuk foto (berlaku 60 detik)...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                {/* 1. Foto Wajah Referensi */}
                <div className="flex flex-col p-3.5 bg-canvas rounded-card border border-borderline">
                  {/* Header dengan min-h konsisten agar posisi bagian atas foto sejajar horizontal */}
                  <div className="flex items-start justify-between gap-2 min-h-[40px] md:min-h-[44px] mb-2.5">
                    <span className="text-xs font-bold text-navy-900 leading-snug">
                      1. Foto Profil Terverifikasi
                    </span>
                    <Badge variant="primary" size="sm" className="shrink-0 whitespace-nowrap">
                      Referensi
                    </Badge>
                  </div>

                  {/* Area Foto dengan aspect ratio 3/4 yang konsisten */}
                  <div className="aspect-[3/4] w-full bg-slate-200 rounded-lg overflow-hidden flex items-center justify-center relative mb-2.5 shadow-xs border border-borderline/60">
                    {photoUrls.faceUrl ? (
                      <img
                        src={photoUrls.faceUrl}
                        alt="Foto Profil Peminjam"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-4 text-xs text-slate-400">
                        <p>Tidak ada foto profil</p>
                      </div>
                    )}
                  </div>

                  {/* Keterangan foto di bagian bawah kartu */}
                  <p className="text-[11px] text-slate-500 text-center leading-normal mt-auto">
                    Foto tersimpan di database profil ketua kelas saat registrasi.
                  </p>
                </div>

                {/* 2. Foto Saat Peminjaman */}
                <div className="flex flex-col p-3.5 bg-canvas rounded-card border border-borderline">
                  {/* Header dengan min-h konsisten agar posisi bagian atas foto sejajar horizontal */}
                  <div className="flex items-start justify-between gap-2 min-h-[40px] md:min-h-[44px] mb-2.5">
                    <span className="text-xs font-bold text-navy-900 leading-snug">
                      2. Foto Serah Terima Pinjam
                    </span>
                    <Badge variant="default" size="sm" className="shrink-0 whitespace-nowrap bg-blue-50 text-blue-700 border-blue-200">
                      Kiosk Meja TU
                    </Badge>
                  </div>

                  {/* Area Foto dengan aspect ratio 3/4 yang konsisten */}
                  <div className="aspect-[3/4] w-full bg-slate-200 rounded-lg overflow-hidden flex items-center justify-center relative mb-2.5 shadow-xs border border-borderline/60">
                    {photoUrls.borrowUrl ? (
                      <img
                        src={photoUrls.borrowUrl}
                        alt="Foto Pengambilan Proyektor"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-4 text-xs text-slate-400">
                        <p>Tidak ada foto peminjaman</p>
                      </div>
                    )}
                  </div>

                  {/* Keterangan foto di bagian bawah kartu */}
                  <p className="text-[11px] text-slate-500 text-center leading-normal mt-auto">
                    Diambil langsung via kamera Kiosk saat QR Pass diverifikasi.
                  </p>
                </div>

                {/* 3. Foto Saat Pengembalian */}
                <div className="flex flex-col p-3.5 bg-canvas rounded-card border border-borderline">
                  {/* Header dengan min-h konsisten agar posisi bagian atas foto sejajar horizontal */}
                  <div className="flex items-start justify-between gap-2 min-h-[40px] md:min-h-[44px] mb-2.5">
                    <span className="text-xs font-bold text-navy-900 leading-snug">
                      3. Foto Serah Terima Kembali
                    </span>
                    <Badge variant="success" size="sm" className="shrink-0 whitespace-nowrap">
                      Kiosk Meja TU
                    </Badge>
                  </div>

                  {/* Area Foto dengan aspect ratio 3/4 yang konsisten */}
                  <div className="aspect-[3/4] w-full bg-slate-200 rounded-lg overflow-hidden flex items-center justify-center relative mb-2.5 shadow-xs border border-borderline/60">
                    {photoUrls.returnUrl ? (
                      <img
                        src={photoUrls.returnUrl}
                        alt="Foto Pengembalian Proyektor"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-4 text-xs text-slate-400">
                        <p>Unit belum dikembalikan atau tidak ada foto</p>
                      </div>
                    )}
                  </div>

                  {/* Keterangan foto di bagian bawah kartu */}
                  <p className="text-[11px] text-slate-500 text-center leading-normal mt-auto">
                    Diambil oleh petugas Kiosk saat unit proyektor dikembalikan.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Export Ledger Modal (NFR-08, FR-12) */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={closeExportModal}
        size="md"
        title="Ekspor Data Transaksi"
        description="Unduh seluruh riwayat transaksi peminjaman proyektor dalam format Excel atau CSV."
        closeOnEsc={!isExporting}
        closeOnOverlayClick={!isExporting}
        showCloseButton={!isExporting}
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={closeExportModal}
              disabled={isExporting}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleExportSubmit(exportFormat)}
              disabled={isExporting}
              isLoading={isExporting}
              loadingText="Menyiapkan Berkas..."
              leftIcon={<FileDown className="w-4 h-4 shrink-0" aria-hidden="true" />}
              className="bg-navy-800 hover:bg-navy-900 text-white"
            >
              {exportFormat === 'xlsx' ? 'Unduh Berkas Excel (.xlsx)' : 'Unduh Berkas CSV (.csv)'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Format Selection Header & Cards */}
          <div>
            <label className="block text-xs font-semibold text-main mb-2">
              Pilih Format Berkas
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Excel Option */}
              <button
                type="button"
                onClick={() => setExportFormat('xlsx')}
                disabled={isExporting}
                className={`p-3 rounded-card border text-left transition-all relative flex flex-col justify-between ${
                  exportFormat === 'xlsx'
                    ? 'border-navy-800 bg-navy-50/60 ring-2 ring-navy-800/15 shadow-xs'
                    : 'border-borderline bg-surface hover:border-slate-300 hover:bg-canvas'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`p-1.5 rounded-element ${
                        exportFormat === 'xlsx'
                          ? 'bg-navy-800 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-main">Microsoft Excel</p>
                      <p className="text-[10px] text-muted font-mono font-medium">.xlsx</p>
                    </div>
                  </div>
                  {exportFormat === 'xlsx' && (
                    <span className="w-4 h-4 rounded-full bg-navy-800 text-white flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted leading-tight">
                  Disertai styling tabel, header tebal, dan auto-filter kolom.
                </p>
              </button>

              {/* CSV Option */}
              <button
                type="button"
                onClick={() => setExportFormat('csv')}
                disabled={isExporting}
                className={`p-3 rounded-card border text-left transition-all relative flex flex-col justify-between ${
                  exportFormat === 'csv'
                    ? 'border-navy-800 bg-navy-50/60 ring-2 ring-navy-800/15 shadow-xs'
                    : 'border-borderline bg-surface hover:border-slate-300 hover:bg-canvas'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`p-1.5 rounded-element ${
                        exportFormat === 'csv'
                          ? 'bg-navy-800 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <FileText className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-main">Berkas Teks CSV</p>
                      <p className="text-[10px] text-muted font-mono font-medium">.csv</p>
                    </div>
                  </div>
                  {exportFormat === 'csv' && (
                    <span className="w-4 h-4 rounded-full bg-navy-800 text-white flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted leading-tight">
                  Format universal ringan (RFC 4180) dengan encoding UTF-8 BOM.
                </p>
              </button>
            </div>
          </div>

          {/* Date Filter Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="export-from-date" className="block text-xs font-semibold text-main">
                Dari Tanggal (Opsional)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-muted">
                  <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <input
                  id="export-from-date"
                  type="date"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                  disabled={isExporting}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-element border border-borderline bg-surface text-main focus:outline-none focus:ring-2 focus:ring-navy-800/20 focus:border-navy-800 transition disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="export-to-date" className="block text-xs font-semibold text-main">
                Sampai Tanggal (Opsional)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-muted">
                  <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <input
                  id="export-to-date"
                  type="date"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                  disabled={isExporting}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-element border border-borderline bg-surface text-main focus:outline-none focus:ring-2 focus:ring-navy-800/20 focus:border-navy-800 transition disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Error Message */}
          {exportError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-card text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" aria-hidden="true" />
              <span>{exportError}</span>
            </div>
          )}

          {/* Information Callout */}
          <div className="p-3 bg-canvas rounded-card border border-borderline/80 text-muted text-[11px] leading-relaxed flex items-start gap-2">
            <span className="text-navy-800 shrink-0 mt-0.5">ℹ️</span>
            <div>
              <span className="font-semibold text-main">Cakupan Data Lengkap:</span> Berkas ekspor mencakup seluruh transaksi yang sesuai filter tanggal (waktu pinjam/kembali WIB, identitas peminjam, kelas, kode proyektor, nama pengembali, catatan kendala, dan nama petugas TU) tanpa dibatasi halaman paginasi.
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminDashboardView;
