/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  X,
  User,
  Clock,
  FileText,
  QrCode,
  History,
  Wrench,
  CheckCircle2,
  SlidersHorizontal,
  AlertTriangle,
  Inbox,
  SearchX,
  Printer,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatWib } from '@/lib/timezone';

export const VALID_STATUS_FILTERS = ['AVAILABLE', 'MAINTENANCE'] as const;
export type ValidStatusFilter = (typeof VALID_STATUS_FILTERS)[number];

export interface ProjectorItem {
  id: string;
  code: string;
  name: string;
  status: 'AVAILABLE' | 'BORROWED' | 'MAINTENANCE' | 'INACTIVE';
  notes: string | null;
  created_at: string;
  updated_at: string;
  active_loan?: {
    id: string;
    borrowed_at: string;
    due_at: string;
    student: {
      id: string;
      name: string;
      nim: string;
    } | null;
  } | null;
}

export interface StatusLog {
  id: string;
  from_status: string;
  to_status: string;
  reason: string | null;
  photo_path: string | null;
  created_at: string;
  staff: {
    id: string;
    name: string;
    role: string;
  } | null;
}

export interface AdminProjectorsContentProps {
  initialProjectors?: ProjectorItem[];
  initialAddModalOpen?: boolean;
  initialEditingProjector?: ProjectorItem | null;
  initialStatusProjector?: ProjectorItem | null;
  initialHistoryProjector?: ProjectorItem | null;
  initialQrPrintProjector?: ProjectorItem | null;
  initialLogs?: StatusLog[];
}

export function AdminProjectorsSkeleton() {
  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-canvas text-main font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-borderline gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-navy-50 text-navy-800 border border-navy-100/80">
                Inventaris Aset
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-main tracking-tight pt-1">
              Manajemen Inventaris Proyektor
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Pengelolaan unit fisik, pencetakan stiker QR aset, dan pelacakan status perawatan.
            </p>
          </div>
        </div>
        <div className="bg-surface rounded-card border border-borderline p-12 text-center text-sm text-slate-500 shadow-sm">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-brand-primary mb-2"></div>
          <p>Memuat daftar inventaris proyektor...</p>
        </div>
      </div>
    </div>
  );
}

export const AdminProjectorsContent: React.FC<AdminProjectorsContentProps> = ({
  initialProjectors,
  initialAddModalOpen,
  initialEditingProjector,
  initialStatusProjector,
  initialHistoryProjector,
  initialQrPrintProjector,
  initialLogs,
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawStatus = (searchParams?.get('status') || '').trim().toUpperCase();
  const activeStatusFilter: ValidStatusFilter | null =
    VALID_STATUS_FILTERS.includes(rawStatus as ValidStatusFilter)
      ? (rawStatus as ValidStatusFilter)
      : null;

  const [projectors, setProjectors] = useState<ProjectorItem[]>(initialProjectors || []);
  const [loading, setLoading] = useState(initialProjectors ? false : true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  // Modal Add
  const [isAddModalOpen, setIsAddModalOpen] = useState(initialAddModalOpen ?? false);
  const [addForm, setAddForm] = useState({ code: '', name: '', notes: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Modal Edit / Deactivate
  const [editingProjector, setEditingProjector] = useState<ProjectorItem | null>(
    initialEditingProjector ?? null
  );
  const [editForm, setEditForm] = useState({
    name: initialEditingProjector?.name || '',
    notes: initialEditingProjector?.notes || '',
    status: initialEditingProjector?.status === 'INACTIVE' ? 'INACTIVE' : 'AVAILABLE',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal Status Maintenance
  const [statusProjector, setStatusProjector] = useState<ProjectorItem | null>(
    initialStatusProjector ?? null
  );
  const [statusForm, setStatusForm] = useState<{
    targetStatus: 'AVAILABLE' | 'MAINTENANCE';
    reason: string;
    photoBase64: string | null;
  }>({
    targetStatus:
      initialStatusProjector?.status === 'AVAILABLE' ? 'MAINTENANCE' : 'AVAILABLE',
    reason: '',
    photoBase64: null,
  });
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Modal Status History
  const [historyProjector, setHistoryProjector] = useState<ProjectorItem | null>(
    initialHistoryProjector ?? null
  );
  const [logs, setLogs] = useState<StatusLog[]>(initialLogs ?? []);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // Modal QR Asset Sticker Print
  const [qrPrintProjector, setQrPrintProjector] = useState<ProjectorItem | null>(
    initialQrPrintProjector ?? null
  );

  const fetchProjectors = useCallback(async (options?: { silent?: boolean }) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (options?.silent) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
      setIsRefreshing(true);
    }
    setError(null);
    try {
      const res = await fetch('/api/admin/projectors', {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Gagal memuat inventaris proyektor.');
      } else {
        setProjectors(data.projectors || []);
      }
    } catch {
      setError('Gangguan jaringan saat menghubungi server.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  }, []);

  const refreshProjectors = useCallback(async () => {
    await fetchProjectors({ silent: true });
  }, [fetchProjectors]);

  useEffect(() => {
    void fetchProjectors();

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !isFetchingRef.current) {
        void refreshProjectors();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [fetchProjectors, refreshProjectors]);

  // Handler Add Projector
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);
    setAddError(null);

    try {
      const res = await fetch('/api/admin/projectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();

      if (!res.ok) {
        setAddError(data.error?.message || 'Gagal menambahkan unit proyektor.');
      } else {
        setIsAddModalOpen(false);
        setAddForm({ code: '', name: '', notes: '' });
        fetchProjectors();
      }
    } catch {
      setAddError('Gangguan jaringan.');
    } finally {
      setAddLoading(false);
    }
  };

  // Handler Edit / Deactivate Projector
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProjector) return;

    setEditLoading(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/admin/projectors/${editingProjector.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();

      if (!res.ok) {
        setEditError(data.error?.message || 'Gagal memperbarui unit proyektor.');
      } else {
        setEditingProjector(null);
        fetchProjectors();
      }
    } catch {
      setEditError('Gangguan jaringan.');
    } finally {
      setEditLoading(false);
    }
  };

  // Handler Status Change (Maintenance <-> Available)
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusProjector) return;

    setStatusLoading(true);
    setStatusError(null);

    try {
      const res = await fetch(`/api/admin/projectors/${statusProjector.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusForm.targetStatus,
          reason: statusForm.reason,
          photo_base64: statusForm.photoBase64,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatusError(data.error?.message || 'Gagal mengubah status proyektor.');
      } else {
        setStatusProjector(null);
        setStatusForm({ targetStatus: 'MAINTENANCE', reason: '', photoBase64: null });
        fetchProjectors();
      }
    } catch {
      setStatusError('Gangguan jaringan.');
    } finally {
      setStatusLoading(false);
    }
  };

  // Open History Logs
  const openHistoryModal = async (projector: ProjectorItem) => {
    setHistoryProjector(projector);
    setLogs([]);
    setLogsLoading(true);
    setLogsError(null);

    try {
      const res = await fetch(`/api/admin/projectors/${projector.id}/logs`);
      const data = await res.json();
      if (!res.ok) {
        setLogsError(data.error?.message || 'Gagal memuat riwayat status.');
      } else {
        setLogs(data.logs || []);
      }
    } catch {
      setLogsError('Gangguan jaringan.');
    } finally {
      setLogsLoading(false);
    }
  };

  // Image Upload Handler for Maintenance Photo
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setStatusForm((prev) => ({ ...prev, photoBase64: result }));
    };
    reader.readAsDataURL(file);
  };

  const filteredProjectors = activeStatusFilter
    ? projectors.filter((p) => p.status === activeStatusFilter)
    : projectors;

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-canvas text-main font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-borderline gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-element border border-borderline bg-surface hover:bg-slate-50 text-slate-600 hover:text-navy-800 text-xs font-semibold shadow-sm transition-all active:scale-[0.99]"
              >
                <ArrowLeft size={13} className="text-slate-500 shrink-0" aria-hidden="true" />
                <span>Kembali ke Dashboard</span>
              </Link>
              <span className="text-slate-300 select-none">/</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-navy-50 text-navy-800 border border-navy-100/80">
                Inventaris Aset
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-main tracking-tight pt-1">
              Manajemen Inventaris Proyektor
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Pengelolaan unit fisik, pencetakan stiker QR aset, dan pelacakan status perawatan.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshProjectors()}
              disabled={loading || isRefreshing}
              leftIcon={
                <RefreshCw
                  size={14}
                  className={`text-slate-500 shrink-0 ${loading || isRefreshing ? 'animate-spin text-brand-primary' : ''}`}
                />
              }
              title="Perbarui data inventaris terbaru dari server"
              className="flex-1 sm:flex-initial min-h-[38px] sm:min-h-[36px]"
            >
              {loading || isRefreshing ? 'Memuat...' : 'Muat Ulang'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setAddForm({ code: '', name: '', notes: '' });
                setAddError(null);
                setIsAddModalOpen(true);
              }}
              leftIcon={<Plus size={15} className="shrink-0" />}
              className="flex-1 sm:flex-initial min-h-[38px] sm:min-h-[36px] bg-brand-primary hover:bg-blue-700 text-white"
            >
              Tambah Unit Baru
            </Button>
          </div>
        </header>

        {/* Filter Status Aktif Indicator Banner (FR-12, UAT Phase 2) */}
        {activeStatusFilter && (
          <div
            data-testid="active-filter-indicator"
            className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 bg-brand-soft/70 border border-blue-200/80 rounded-card gap-3 shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-brand-primary animate-pulse shrink-0"></span>
              <p className="text-xs text-navy-900 leading-relaxed">
                <span className="font-semibold text-navy-800">Filter Aktif:</span> Menampilkan unit dengan status{' '}
                <span className="font-bold underline text-navy-900">
                  {activeStatusFilter === 'AVAILABLE' ? 'Tersedia (AVAILABLE)' : 'Dalam Perawatan (MAINTENANCE)'}
                </span>
                {' '}({filteredProjectors.length} dari {projectors.length} unit)
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              data-testid="reset-filter-button"
              onClick={() => router.push('/admin/projectors')}
              leftIcon={<X size={13} className="shrink-0" />}
              className="w-full sm:w-auto bg-surface hover:bg-blue-50 border-blue-200 text-brand-primary hover:text-blue-700 text-xs font-semibold min-h-[34px] shadow-sm"
            >
              Tampilkan Semua Unit
            </Button>
          </div>
        )}

        {/* Content Section */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-element text-xs text-rose-700 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Terjadi Kesalahan</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-surface rounded-card border border-borderline p-12 text-center text-sm text-slate-500 shadow-sm">
            <LoadingSpinner size="lg" variant="navy" className="mx-auto mb-3" />
            <p>Memuat daftar inventaris proyektor...</p>
          </div>
        ) : projectors.length === 0 ? (
          <EmptyState
            icon={<Inbox size={26} className="text-brand-primary" />}
            title="Belum ada unit proyektor terdaftar"
            description="Gunakan tombol &quot;Tambah Unit Baru&quot; di atas untuk mendaftarkan aset proyektor pertama."
          />
        ) : filteredProjectors.length === 0 ? (
          <EmptyState
            icon={<SearchX size={26} className="text-brand-primary" />}
            title={`Tidak ada unit proyektor dengan status "${activeStatusFilter === 'AVAILABLE' ? 'Tersedia' : 'Dalam Perawatan'}"`}
            description="Saat ini tidak ada unit proyektor yang sedang dalam status tersebut."
            action={
              <Button
                variant="primary"
                size="sm"
                data-testid="empty-reset-filter-button"
                onClick={() => router.push('/admin/projectors')}
                leftIcon={<X size={13} className="shrink-0" />}
                className="bg-brand-primary hover:bg-blue-700 text-white min-h-[36px]"
              >
                Tampilkan Semua Unit
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjectors.map((p) => {
              const statusBadge =
                p.status === 'AVAILABLE' ? (
                  <Badge variant="success" dot size="sm">
                    Tersedia
                  </Badge>
                ) : p.status === 'BORROWED' ? (
                  <Badge variant="primary" dot size="sm">
                    Sedang Dipinjam
                  </Badge>
                ) : p.status === 'MAINTENANCE' ? (
                  <Badge variant="warning" dot size="sm">
                    Dalam Perawatan
                  </Badge>
                ) : (
                  <Badge variant="neutral" dot size="sm">
                    Nonaktif
                  </Badge>
                );

              return (
                <Card
                  key={p.id}
                  variant="default"
                  padding="sm"
                  className="flex flex-col justify-between hover:border-slate-300 transition-all duration-150 shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <span className="inline-flex px-2 py-0.5 rounded font-mono text-xs font-bold text-navy-800 bg-navy-50 border border-navy-100">
                          {p.code}
                        </span>
                        <h3 className="font-bold text-main text-base tracking-tight truncate" title={p.name}>
                          {p.name}
                        </h3>
                      </div>
                      <div className="shrink-0">{statusBadge}</div>
                    </div>

                    {p.status === 'BORROWED' && p.active_loan && (
                      <div className="p-3 bg-brand-soft/60 border border-blue-100 rounded-element text-xs text-navy-900 space-y-1">
                        <p className="font-medium flex items-center gap-1.5 truncate">
                          <User size={13} className="text-brand-primary shrink-0" />
                          <span className="truncate">
                            Peminjam: {p.active_loan.student?.name || 'Mahasiswa'} (NIM {p.active_loan.student?.nim || '-'})
                          </span>
                        </p>
                        <p className="text-[11px] text-blue-700 flex items-center gap-1.5 pl-4 sm:pl-5">
                          <Clock size={11} className="text-blue-500 shrink-0" />
                          <span>Batas kembali: {formatWib(p.active_loan.due_at, 'time')}</span>
                        </p>
                      </div>
                    )}

                    {p.notes && (
                      <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-element text-xs text-slate-600 flex items-start gap-1.5">
                        <FileText size={13} className="text-slate-400 shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                          <span className="font-semibold text-slate-700">Catatan:</span> {p.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions Grid */}
                  <div className="pt-3.5 mt-3 border-t border-borderline grid grid-cols-2 gap-2 text-xs">
                    {/* Cetak Stiker QR */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQrPrintProjector(p)}
                      leftIcon={<QrCode size={14} className="text-slate-500 shrink-0" />}
                      className="w-full min-h-[36px] text-xs font-semibold text-slate-700 hover:text-navy-800"
                    >
                      Stiker QR
                    </Button>

                    {/* Riwayat Status */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openHistoryModal(p)}
                      leftIcon={<History size={14} className="text-slate-500 shrink-0" />}
                      className="w-full min-h-[36px] text-xs font-semibold text-slate-700 hover:text-navy-800"
                    >
                      Riwayat
                    </Button>

                    {/* Ubah Status / Maintenance (Available / Maintenance) */}
                    <button
                      type="button"
                      disabled={p.status === 'BORROWED' || p.status === 'INACTIVE'}
                      onClick={() => {
                        setStatusProjector(p);
                        setStatusForm({
                          targetStatus: p.status === 'AVAILABLE' ? 'MAINTENANCE' : 'AVAILABLE',
                          reason: '',
                          photoBase64: null,
                        });
                        setStatusError(null);
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-button min-h-[36px] text-xs font-semibold border transition-all duration-150 select-none ${
                        p.status === 'BORROWED' || p.status === 'INACTIVE'
                          ? 'bg-slate-100 text-slate-400 border-borderline cursor-not-allowed opacity-60'
                          : p.status === 'MAINTENANCE'
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 shadow-sm active:scale-[0.99]'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200 shadow-sm active:scale-[0.99]'
                      }`}
                    >
                      {p.status === 'MAINTENANCE' ? (
                        <CheckCircle2 size={14} className="shrink-0" />
                      ) : (
                        <Wrench size={14} className="shrink-0" />
                      )}
                      <span className="truncate">
                        {p.status === 'MAINTENANCE' ? 'Set Siap Pakai' : 'Lapor Perawatan'}
                      </span>
                    </button>

                    {/* Edit / Nonaktifkan */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingProjector(p);
                        setEditForm({
                          name: p.name,
                          notes: p.notes || '',
                          status: p.status === 'INACTIVE' ? 'INACTIVE' : 'AVAILABLE',
                        });
                        setEditError(null);
                      }}
                      leftIcon={<SlidersHorizontal size={14} className="text-slate-500 shrink-0" />}
                      className="w-full min-h-[36px] text-xs font-semibold text-slate-700 hover:text-navy-800"
                    >
                      Kelola Unit
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal 1: Add Projector */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setAddError(null);
        }}
        size="md"
        title="Tambah Unit Proyektor Baru"
        description="Daftarkan unit fisik proyektor baru ke dalam inventaris aset kampus."
      >
        {addError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-element text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-500 shrink-0" />
            <span>{addError}</span>
          </div>
        )}

        <form onSubmit={handleAddSubmit} className="space-y-4">
          <Input
            label="Kode Proyektor (Unik, mis. PROJ-01)"
            required
            placeholder="PROJ-01"
            value={addForm.code}
            onChange={(e) => setAddForm({ ...addForm, code: e.target.value.toUpperCase() })}
            disabled={addLoading}
            className="font-mono uppercase"
          />

          <Input
            label="Nama / Tipe Proyektor"
            required
            placeholder="Epson EB-X400 #1"
            value={addForm.name}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            disabled={addLoading}
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 select-none">
              Catatan Tambahan (Opsional)
            </label>
            <textarea
              rows={2}
              placeholder="Kondisi baru, kabel HDMI bawaan lengkap..."
              value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              disabled={addLoading}
              className="w-full rounded-element border border-borderline text-sm text-main placeholder:text-slate-400 bg-surface focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none p-3 transition-colors disabled:opacity-60 disabled:bg-canvas disabled:cursor-not-allowed"
            />
          </div>

          <div className="pt-3 border-t border-borderline flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                setAddError(null);
              }}
              disabled={addLoading}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              isLoading={addLoading}
              loadingText="Menyimpan..."
              className="bg-brand-primary hover:bg-blue-700 text-white min-h-[36px]"
            >
              Simpan Unit
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Edit / Deactivate Projector */}
      <Modal
        isOpen={Boolean(editingProjector)}
        onClose={() => {
          setEditingProjector(null);
          setEditError(null);
        }}
        size="md"
        title="Kelola Unit Proyektor"
        description={editingProjector ? `Kode Aset: ${editingProjector.code}` : undefined}
      >
        {editError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-element text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-500 shrink-0" />
            <span>{editError}</span>
          </div>
        )}

        {editingProjector && (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <Input
              label="Nama / Tipe Proyektor"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              disabled={editLoading}
            />

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 select-none">
                Catatan Unit
              </label>
              <textarea
                rows={2}
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                disabled={editLoading}
                className="w-full rounded-element border border-borderline text-sm text-main placeholder:text-slate-400 bg-surface focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none p-3 transition-colors disabled:opacity-60 disabled:bg-canvas disabled:cursor-not-allowed"
              />
            </div>

            {/* Status Nonaktif Switch */}
            <div className="p-3.5 bg-canvas border border-borderline rounded-element space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Status Keaktifan Aset</p>
                  <p className="text-[11px] text-slate-500">Unit nonaktif tidak dapat dipinjam di Kiosk.</p>
                </div>
                <button
                  type="button"
                  disabled={editLoading || editingProjector.status === 'BORROWED'}
                  onClick={() =>
                    setEditForm((prev) => ({
                      ...prev,
                      status: prev.status === 'INACTIVE' ? 'AVAILABLE' : 'INACTIVE',
                    }))
                  }
                  className={`px-3 py-1.5 rounded-element text-xs font-semibold transition border select-none ${
                    editingProjector.status === 'BORROWED'
                      ? 'bg-slate-100 text-slate-400 border-borderline cursor-not-allowed opacity-60'
                      : editForm.status === 'INACTIVE'
                      ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  {editForm.status === 'INACTIVE' ? 'Nonaktif' : 'Aktif'}
                </button>
              </div>
              {editingProjector.status === 'BORROWED' && (
                <p className="text-[11px] text-amber-700 font-medium">
                  Unit sedang dipinjam dan tidak dapat dinonaktifkan.
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-borderline flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setEditingProjector(null);
                  setEditError(null);
                }}
                disabled={editLoading}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                isLoading={editLoading}
                loadingText="Menyimpan..."
                className="bg-brand-primary hover:bg-blue-700 text-white min-h-[36px]"
              >
                Simpan Perubahan
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal 3: Maintenance Status Change (FR-09) */}
      <Modal
        isOpen={Boolean(statusProjector)}
        onClose={() => {
          setStatusProjector(null);
          setStatusError(null);
        }}
        size="md"
        title={
          statusForm.targetStatus === 'MAINTENANCE'
            ? 'Lapor Perawatan / Kerusakan Unit'
            : 'Kembalikan Unit ke Siap Pakai'
        }
        description={
          statusProjector ? `${statusProjector.code} — ${statusProjector.name}` : undefined
        }
      >
        {statusError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-element text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-500 shrink-0" />
            <span>{statusError}</span>
          </div>
        )}

        {statusProjector && (
          <form onSubmit={handleStatusSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 select-none">
                Status Baru:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={statusLoading}
                  onClick={() => setStatusForm((prev) => ({ ...prev, targetStatus: 'AVAILABLE' }))}
                  className={`py-2 px-3 rounded-element text-xs font-semibold border transition select-none ${
                    statusForm.targetStatus === 'AVAILABLE'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-sm'
                      : 'bg-surface border-borderline text-slate-600 hover:bg-canvas'
                  }`}
                >
                  Tersedia (Siap Pakai)
                </button>
                <button
                  type="button"
                  disabled={statusLoading}
                  onClick={() => setStatusForm((prev) => ({ ...prev, targetStatus: 'MAINTENANCE' }))}
                  className={`py-2 px-3 rounded-element text-xs font-semibold border transition select-none ${
                    statusForm.targetStatus === 'MAINTENANCE'
                      ? 'bg-amber-50 border-amber-400 text-amber-800 shadow-sm'
                      : 'bg-surface border-borderline text-slate-600 hover:bg-canvas'
                  }`}
                >
                  Dalam Perawatan
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 select-none">
                Alasan Perubahan Status <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder={
                  statusForm.targetStatus === 'MAINTENANCE'
                    ? 'Kabel power longgar, lampu redup, kipas berisik...'
                    : 'Kabel power telah diganti baru dan unit telah diuji normal.'
                }
                value={statusForm.reason}
                onChange={(e) => setStatusForm((prev) => ({ ...prev, reason: e.target.value }))}
                disabled={statusLoading}
                className="w-full rounded-element border border-borderline text-sm text-main placeholder:text-slate-400 bg-surface focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none p-3 transition-colors disabled:opacity-60 disabled:bg-canvas disabled:cursor-not-allowed"
              />
            </div>

            {/* Upload Foto Kendala Opsional */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 select-none">
                Foto Dokumentasi Kendala (Opsional, max 250 KB)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={statusLoading}
                className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-element file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer disabled:opacity-60"
              />
              {statusForm.photoBase64 && (
                <div className="mt-2 flex items-center gap-3 p-2 bg-canvas border border-borderline rounded-element w-fit">
                  <div className="aspect-video w-28 rounded-element border border-borderline overflow-hidden bg-slate-100">
                    <img
                      src={statusForm.photoBase64}
                      alt="Preview Kendala"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setStatusForm((prev) => ({ ...prev, photoBase64: null }))}
                    leftIcon={<Trash2 size={13} className="text-rose-500" />}
                    className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  >
                    Hapus Foto
                  </Button>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-borderline flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setStatusProjector(null);
                  setStatusError(null);
                }}
                disabled={statusLoading}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                isLoading={statusLoading}
                loadingText="Memproses..."
                className="bg-brand-primary hover:bg-blue-700 text-white min-h-[36px]"
              >
                Perbarui Status
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal 4: Status History Timeline (FR-09) */}
      <Modal
        isOpen={Boolean(historyProjector)}
        onClose={() => {
          setHistoryProjector(null);
          setLogsError(null);
        }}
        size="lg"
        title="Riwayat Perubahan Status"
        description={
          historyProjector ? `${historyProjector.code} — ${historyProjector.name}` : undefined
        }
        footer={
          <div className="flex justify-end w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHistoryProjector(null);
                setLogsError(null);
              }}
            >
              Tutup
            </Button>
          </div>
        }
      >
        {logsLoading ? (
          <div className="py-10 text-center text-xs text-slate-500">
            <LoadingSpinner size="md" variant="navy" className="mx-auto mb-2" />
            <p>Memuat catatan kronologis...</p>
          </div>
        ) : logsError ? (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-element text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-500 shrink-0" />
            <span>{logsError}</span>
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<History size={24} className="text-slate-400" />}
            title="Belum ada riwayat"
            description="Belum ada riwayat perubahan status untuk unit proyektor ini."
          />
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 bg-canvas border border-borderline rounded-element text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 font-semibold text-main">
                    <Badge variant="neutral" size="sm">
                      {log.from_status}
                    </Badge>
                    <span className="text-slate-400">→</span>
                    <Badge
                      variant={
                        log.to_status === 'AVAILABLE'
                          ? 'success'
                          : log.to_status === 'MAINTENANCE'
                          ? 'warning'
                          : 'primary'
                      }
                      size="sm"
                    >
                      {log.to_status}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {formatWib(log.created_at, 'full')}
                  </span>
                </div>
                {log.reason && (
                  <p className="text-slate-700 leading-relaxed pt-0.5">
                    <span className="font-semibold text-slate-800">Alasan:</span> {log.reason}
                  </p>
                )}
                <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center gap-1">
                  <span>Diproses oleh:</span>
                  <span className="font-medium text-slate-700">
                    {log.staff?.name || 'Sistem / Transaksi Kiosk'}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal 5: Printable QR Asset Sticker Tag (FR-10, FT-03) */}
      <Modal
        isOpen={Boolean(qrPrintProjector)}
        onClose={() => setQrPrintProjector(null)}
        size="sm"
        title="Stiker QR Aset Proyektor"
        description="Pindai di Kiosk PINJAM saat transaksi peminjaman atau pengembalian."
        footer={
          <div className="flex justify-end gap-2 w-full print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQrPrintProjector(null)}
            >
              Tutup
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.print()}
              leftIcon={<Printer size={14} className="shrink-0" />}
              className="bg-brand-primary hover:bg-blue-700 text-white min-h-[36px]"
            >
              Cetak Stiker
            </Button>
          </div>
        }
      >
        {qrPrintProjector && (
          <div
            id="printable-qr-tag"
            className="p-6 bg-white border-2 border-dashed border-slate-400 rounded-card flex flex-col items-center text-center space-y-3 mx-auto max-w-[280px]"
          >
            <div className="border-b border-slate-200 pb-2 w-full">
              <p className="text-[10px] tracking-widest uppercase font-bold text-slate-500">
                PINJAM ASSET TAG
              </p>
              <h4 className="text-xl font-black font-mono text-slate-900 mt-0.5">
                {qrPrintProjector.code}
              </h4>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-element shadow-sm">
              <QRCodeSVG
                value={qrPrintProjector.code}
                size={180}
                level="H"
                marginSize={2}
              />
            </div>

            <div className="w-full pt-1">
              <p className="text-xs font-bold text-slate-800">{qrPrintProjector.name}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Pindai di Kiosk PINJAM saat pinjam / kembali
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Scoped Print Invariant Styles (FR-10, FT-03) */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-qr-tag,
          #printable-qr-tag * {
            visibility: visible !important;
          }
          #printable-qr-tag {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            margin: 0 !important;
            border: 2px dashed #94a3b8 !important;
            background-color: #ffffff !important;
            width: 280px !important;
            padding: 1.5rem !important;
            box-shadow: none !important;
            z-index: 999999 !important;
          }
        }
      `}</style>
    </div>
  );
};
