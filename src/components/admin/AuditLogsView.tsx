'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  History,
  ShieldCheck,
  Shield,
  User,
  Cpu,
  Search,
  Filter,
  Calendar,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Check,
  AlertTriangle,
  FileText,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatWib } from '@/lib/timezone';

export interface AuditLogItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  actor: {
    type: 'STAFF' | 'ADMIN' | 'STUDENT' | 'SYSTEM';
    name: string;
    detail: string | null;
    id: string | null;
  };
  metadata: Record<string, unknown>;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export default function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterEntityType, setFilterEntityType] = useState('ALL');
  const [filterActorType, setFilterActorType] = useState<'ALL' | 'STAFF' | 'STUDENT' | 'SYSTEM'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Metadata Modal State
  const [activeMetadataLog, setActiveMetadataLog] = useState<AuditLogItem | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchAuditLogs = useCallback(
    async (pageToFetch = pagination.page) => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', pageToFetch.toString());
        queryParams.set('limit', pagination.limit.toString());

        if (filterAction !== 'ALL') queryParams.set('action', filterAction);
        if (filterEntityType !== 'ALL') queryParams.set('entity_type', filterEntityType);
        if (filterActorType !== 'ALL') queryParams.set('actor_type', filterActorType);
        if (startDate) queryParams.set('start_date', startDate);
        if (endDate) queryParams.set('end_date', endDate);
        if (searchTerm.trim()) queryParams.set('search', searchTerm.trim());

        const res = await fetch(`/api/admin/audit-logs?${queryParams.toString()}`);
        const json = await res.json();

        if (!res.ok) {
          setError(json.error?.message || 'Gagal memuat catatan audit log.');
        } else {
          setLogs(json.data || []);
          if (json.pagination) {
            setPagination(json.pagination);
          }
        }
      } catch {
        setError('Gangguan jaringan saat memuat catatan audit.');
      } finally {
        setLoading(false);
      }
    },
    [
      pagination.limit,
      pagination.page,
      filterAction,
      filterEntityType,
      filterActorType,
      startDate,
      endDate,
      searchTerm,
    ]
  );

  useEffect(() => {
    fetchAuditLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAction, filterEntityType, filterActorType, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAuditLogs(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterAction('ALL');
    setFilterEntityType('ALL');
    setFilterActorType('ALL');
    setStartDate('');
    setEndDate('');
    fetchAuditLogs(1);
  };

  const handleCopyJson = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper untuk rendering badge warna aksi
  const getActionBadgeColor = (action: string) => {
    if (action.includes('BORROWED') || action.includes('APPROVED') || action.includes('CREATED') || action.includes('ACTIVATED')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (action.includes('RETURNED') || action.includes('CLAIM')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (action.includes('REVOKED') || action.includes('DEACTIVATED') || action.includes('REJECTED')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (action.includes('ISSUE') || action.includes('MAINTENANCE') || action.includes('WARNING')) {
      return 'bg-amber-50 text-amber-800 border-amber-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  // Helper ringkasan keterangan aksi dari metadata
  const getActionSummary = (item: AuditLogItem) => {
    const { action, metadata, entity_id } = item;
    if (action === 'LOAN_BORROWED') {
      return `Peminjaman proyektor ${metadata.projector_code || ''} oleh mahasiswa`;
    }
    if (action === 'LOAN_RETURNED') {
      return `Pengembalian proyektor ${metadata.projector_code || ''} (kondisi: ${metadata.condition || 'NORMAL'})`;
    }
    if (action === 'LOAN_RETURNED_WITH_ISSUE') {
      return `Pengembalian proyektor disertai laporan kendala: ${metadata.damage_notes || 'Ada kendala'}`;
    }
    if (action === 'STAFF_CREATED') {
      return `Pembuatan akun petugas baru: ${metadata.staff_name || ''} (${metadata.role || 'STAFF'})`;
    }
    if (action === 'STAFF_DEACTIVATED') {
      return `Penonaktifan akun staf: ${metadata.staff_name || entity_id || ''}`;
    }
    if (action === 'STAFF_ACTIVATED') {
      return `Pengaktifan kembali akun staf: ${metadata.staff_name || entity_id || ''}`;
    }
    if (action === 'QR_REVOKED') {
      return `Pencabutan mandiri token QR Pass mahasiswa (versi token dinaikkan)`;
    }
    if (action === 'LEADER_TRANSFERRED') {
      return `Serah-terima jabatan ketua kelas kepada mahasiswa rekan sekelas`;
    }
    if (action === 'VERIFICATION_DECIDED') {
      return `Keputusan verifikasi pendaftaran mahasiswa: ${metadata.decision || ''}`;
    }
    if (action === 'PROJECTOR_STATUS_CHANGED') {
      return `Perubahan status unit menjadi ${metadata.to_status || ''}`;
    }
    if (action === 'LOANS_EXPORTED') {
      return `Ekspor riwayat buku besar transaksi ke berkas CSV`;
    }
    if (action === 'RETENTION_CLEANUP_EXECUTED') {
      return `Pembersihan retensi terjadwal otomatis (foto & data usang)`;
    }
    return `Tindakan ${action} pada entitas ${item.entity_type}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Kembali ke Dashboard Admin</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAuditLogs(pagination.page)}
              disabled={loading}
              className="text-xs flex items-center gap-1.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Segarkan</span>
            </Button>
          </div>
        </div>

        {/* Header Title Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2.5 bg-purple-50 text-purple-700 rounded-xl">
                <History size={22} />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Jejak Audit Sistem (Audit Logs)
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Buku catatan keamanan dan operasional append-only sesuai PRD Revisi 3 (FR-19).
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              🔒 Append-Only (Tidak Dapat Diubah/Dihapus)
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Cari jenis tindakan atau target ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              Cari
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs"
            >
              Reset Filter
            </Button>
          </form>

          {/* Filter Baris Kedua */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
            {/* Filter Action */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Jenis Tindakan:
              </label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">Semua Tindakan</option>
                <option value="LOAN_BORROWED">Peminjaman (LOAN_BORROWED)</option>
                <option value="LOAN_RETURNED">Pengembalian (LOAN_RETURNED)</option>
                <option value="LOAN_RETURNED_WITH_ISSUE">Laporan Kendala (LOAN_RETURNED_WITH_ISSUE)</option>
                <option value="QR_REVOKED">Cabut QR (QR_REVOKED)</option>
                <option value="LEADER_TRANSFERRED">Alihkan Jabatan (LEADER_TRANSFERRED)</option>
                <option value="VERIFICATION_DECIDED">Keputusan Verifikasi (VERIFICATION_DECIDED)</option>
                <option value="PROJECTOR_STATUS_CHANGED">Status Proyektor (PROJECTOR_STATUS_CHANGED)</option>
                <option value="STAFF_CREATED">Tambah Staf (STAFF_CREATED)</option>
                <option value="STAFF_DEACTIVATED">Nonaktifkan Staf (STAFF_DEACTIVATED)</option>
                <option value="STAFF_ACTIVATED">Aktifkan Staf (STAFF_ACTIVATED)</option>
                <option value="LOANS_EXPORTED">Ekspor CSV (LOANS_EXPORTED)</option>
                <option value="RETENTION_CLEANUP_EXECUTED">Cron Retensi (RETENTION_CLEANUP_EXECUTED)</option>
              </select>
            </div>

            {/* Filter Entity Type */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Tipe Entitas:
              </label>
              <select
                value={filterEntityType}
                onChange={(e) => setFilterEntityType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">Semua Entitas</option>
                <option value="loans">Transaksi (loans)</option>
                <option value="students">Mahasiswa (students)</option>
                <option value="projectors">Proyektor (projectors)</option>
                <option value="classes">Kelas (classes)</option>
                <option value="staff_profiles">Profil Staf (staff_profiles)</option>
                <option value="class_leader_claims">Klaim Ketua (class_leader_claims)</option>
                <option value="app_settings">Pengaturan (app_settings)</option>
              </select>
            </div>

            {/* Filter Tipe Aktor */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Aktor Pelaksana:
              </label>
              <select
                value={filterActorType}
                onChange={(e) => setFilterActorType(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">Semua Aktor</option>
                <option value="STAFF">Staf TU &amp; Admin</option>
                <option value="STUDENT">Mahasiswa</option>
                <option value="SYSTEM">Sistem Otomatis (Cron)</option>
              </select>
            </div>

            {/* Filter Tanggal */}
            <div className="flex gap-1.5 items-end">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Mulai:
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-1.5 text-xs text-slate-800 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Sampai:
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-1.5 text-xs text-slate-800 focus:outline-none"
                />
              </div>
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
            <Button variant="outline" size="sm" onClick={() => fetchAuditLogs(1)} className="text-xs">
              Coba Lagi
            </Button>
          </div>
        )}

        {/* Table View */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center space-y-3" role="status" aria-label="Memuat catatan audit">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <p className="text-xs text-slate-500">Memuat catatan audit log...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl">
                <FileText size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Tidak ada catatan audit ditemukan</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchTerm || filterAction !== 'ALL' || filterEntityType !== 'ALL' || startDate || endDate
                  ? 'Coba sesuaikan kata kunci pencarian atau rentang tanggal yang dipilih.'
                  : 'Belum ada kejadian audit yang tercatat di sistem.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Waktu (WIB)</th>
                    <th className="py-3 px-4">Aktor Pelaksana</th>
                    <th className="py-3 px-4">Jenis Tindakan</th>
                    <th className="py-3 px-4">Entitas &amp; Target</th>
                    <th className="py-3 px-4">Ringkasan Aktivitas</th>
                    <th className="py-3 px-4 text-right">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {logs.map((item) => {
                    const badgeClass = getActionBadgeColor(item.action);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Waktu WIB */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <p className="font-medium text-slate-900">{formatWib(item.created_at)}</p>
                          <p className="text-[10px] text-slate-400 font-mono">ID: {item.id.slice(0, 8)}...</p>
                        </td>

                        {/* Aktor */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 text-xs">
                              {item.actor.type === 'ADMIN' ? (
                                <ShieldCheck size={14} className="text-purple-600" />
                              ) : item.actor.type === 'STAFF' ? (
                                <Shield size={14} className="text-blue-600" />
                              ) : item.actor.type === 'STUDENT' ? (
                                <User size={14} className="text-emerald-600" />
                              ) : (
                                <Cpu size={14} className="text-slate-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 text-xs">{item.actor.name}</p>
                              {item.actor.detail && (
                                <p className="text-[11px] text-slate-400">{item.actor.detail}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Tindakan */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badgeClass}`}
                          >
                            {item.action}
                          </span>
                        </td>

                        {/* Entitas & Target */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <p className="font-medium text-slate-800">{item.entity_type}</p>
                          {item.entity_id ? (
                            <p className="text-[11px] text-slate-400 font-mono" title={item.entity_id}>
                              target: {item.entity_id.length > 16 ? `${item.entity_id.slice(0, 16)}...` : item.entity_id}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">-</p>
                          )}
                        </td>

                        {/* Ringkasan */}
                        <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
                          <p className="text-xs text-slate-600 line-clamp-2">{getActionSummary(item)}</p>
                        </td>

                        {/* Tombol Metadata */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setActiveMetadataLog(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors"
                          >
                            <Eye size={13} />
                            <span>Detail</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && logs.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
              <div>
                <span>
                  Menampilkan halaman <strong className="text-slate-900">{pagination.page}</strong> dari{' '}
                  <strong className="text-slate-900">{pagination.total_pages}</strong> (Total{' '}
                  <strong className="text-slate-900">{pagination.total}</strong> rekaman audit)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => fetchAuditLogs(pagination.page - 1)}
                  className="text-xs flex items-center gap-1"
                >
                  <ChevronLeft size={14} />
                  <span>Sebelumnya</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.total_pages}
                  onClick={() => fetchAuditLogs(pagination.page + 1)}
                  className="text-xs flex items-center gap-1"
                >
                  <span>Berikutnya</span>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Detail Metadata Log */}
      {activeMetadataLog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-xl space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                  {activeMetadataLog.action}
                </span>
                <h3 id="audit-modal-title" className="text-base font-bold text-slate-900 mt-1">
                  Rincian Entri Jejak Audit
                </h3>
                <p className="text-xs text-slate-500">{formatWib(activeMetadataLog.created_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveMetadataLog(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                aria-label="Tutup dialog rincian"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500">Aktor:</span>
                <p className="font-semibold text-slate-800">{activeMetadataLog.actor.name}</p>
              </div>
              <div>
                <span className="text-slate-500">Tipe Aktor:</span>
                <p className="font-semibold text-slate-800">{activeMetadataLog.actor.type}</p>
              </div>
              <div>
                <span className="text-slate-500">Entitas:</span>
                <p className="font-semibold text-slate-800">{activeMetadataLog.entity_type}</p>
              </div>
              <div>
                <span className="text-slate-500">Target ID:</span>
                <p className="font-mono text-slate-800 text-[11px] truncate">{activeMetadataLog.entity_id || '-'}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-700">Metadata (JSON Disanitasi):</span>
                <button
                  type="button"
                  onClick={() => handleCopyJson(JSON.stringify(activeMetadataLog.metadata, null, 2))}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                >
                  {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span>{copied ? 'Tersalin!' : 'Salin JSON'}</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto max-h-60 leading-relaxed">
                {JSON.stringify(activeMetadataLog.metadata, null, 2)}
              </pre>
            </div>

            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveMetadataLog(null)}
                className="w-full text-xs py-2 rounded-xl"
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
