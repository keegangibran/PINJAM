'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { formatWib } from '@/lib/timezone';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  FileText,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';

export interface LeaderClaimItem {
  id: string;
  class_id: string;
  student_id: string;
  claim_type: 'INITIAL' | 'REPLACEMENT' | 'TRANSFER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decided_by: string | null;
  decided_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  student?: {
    id: string;
    nim: string;
    name: string;
    email: string;
    registration_status: string;
    profile_photo_path: string | null;
  } | null;
  class?: {
    id: string;
    study_program: string;
    cohort_year: number;
    section: string;
    academic_term: string;
    is_active: boolean;
    leader_student_id: string | null;
  } | null;
  decided_by_staff?: {
    id: string;
    name: string;
    role: string;
  } | null;
}

export interface ClaimsSummary {
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  total_count: number;
}

interface LeaderClaimsInboxViewProps {
  onPendingCountChange?: (count: number) => void;
}

export default function LeaderClaimsInboxView({ onPendingCountChange }: LeaderClaimsInboxViewProps) {
  const [claims, setClaims] = useState<LeaderClaimItem[]>([]);
  const [summary, setSummary] = useState<ClaimsSummary>({
    pending_count: 0,
    approved_count: 0,
    rejected_count: 0,
    total_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [claimTypeFilter, setClaimTypeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState<{
    claim: LeaderClaimItem;
    type: 'APPROVED' | 'REJECTED';
  } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (claimTypeFilter !== 'ALL') params.set('claim_type', claimTypeFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const res = await fetch(`/api/admin/leader-claims?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || 'Gagal memuat antrean klaim ketua kelas.');
      } else {
        setClaims(json.data || []);
        if (json.summary) {
          setSummary(json.summary);
          if (onPendingCountChange) {
            onPendingCountChange(json.summary.pending_count);
          }
        }
      }
    } catch {
      setError('Gangguan jaringan saat memuat data klaim.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, claimTypeFilter, searchTerm, onPendingCountChange]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const handleOpenDecisionModal = (claim: LeaderClaimItem, type: 'APPROVED' | 'REJECTED') => {
    setDecisionModal({ claim, type });
    setDecisionNotes(type === 'APPROVED' ? 'Disetujui oleh petugas TU' : 'Klaim tidak memenuhi persyaratan');
    setActionFeedback(null);
  };

  const handleCloseDecisionModal = () => {
    if (isSubmitting) return;
    setDecisionModal(null);
    setDecisionNotes('');
  };

  const handleSubmitDecision = async () => {
    if (!decisionModal) return;
    setIsSubmitting(true);
    setActionFeedback(null);

    try {
      const res = await fetch(`/api/admin/leader-claims/${decisionModal.claim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: decisionModal.type,
          notes: decisionNotes.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setActionFeedback({ message: json.error?.message || 'Gagal memproses keputusan klaim.', isError: true });
      } else {
        setActionFeedback({ message: json.message || 'Keputusan klaim berhasil disimpan.', isError: false });
        setTimeout(() => {
          setDecisionModal(null);
          setDecisionNotes('');
          fetchClaims();
        }, 1200);
      }
    } catch {
      setActionFeedback({ message: 'Terjadi kesalahan sistem saat menghubungi server.', isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Menunggu Keputusan</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{summary.pending_count}</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Klaim Disetujui</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{summary.approved_count}</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Klaim Ditolak</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{summary.rejected_count}</p>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl">
            <XCircle className="w-5 h-5 text-rose-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Seluruh Klaim</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{summary.total_count}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <Users className="w-5 h-5 text-slate-600" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
            {[
              { id: 'PENDING', label: 'Menunggu', count: summary.pending_count },
              { id: 'APPROVED', label: 'Disetujui', count: summary.approved_count },
              { id: 'REJECTED', label: 'Ditolak', count: summary.rejected_count },
              { id: 'ALL', label: 'Semua Status', count: summary.total_count },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  statusFilter === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    statusFilter === tab.id ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari mahasiswa / NIM / prodi..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <select
              value={claimTypeFilter}
              onChange={(e) => setClaimTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Jenis</option>
              <option value="INITIAL">Klaim Awal (INITIAL)</option>
              <option value="REPLACEMENT">Penggantian (REPLACEMENT)</option>
              <option value="TRANSFER">Pengalihan (TRANSFER)</option>
            </select>

            <button
              onClick={fetchClaims}
              disabled={loading}
              title="Segarkan antrean"
              aria-label="Segarkan antrean"
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main List */}
      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
          <p className="text-xs text-slate-500">Memuat data antrean klaim ketua kelas...</p>
        </div>
      ) : claims.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
            <UserCheck className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-800">Tidak ada pengajuan klaim</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {statusFilter === 'PENDING'
              ? 'Saat ini tidak ada permohonan klaim ketua kelas yang menunggu persetujuan.'
              : 'Tidak ditemukan data klaim ketua kelas untuk kriteria filter yang dipilih.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Mahasiswa Pemohon</th>
                  <th className="py-3 px-4">Kelas & Semester</th>
                  <th className="py-3 px-4">Jenis Klaim</th>
                  <th className="py-3 px-4">Status & Waktu</th>
                  <th className="py-3 px-4">Catatan</th>
                  <th className="py-3 px-4 text-right">Aksi Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((claim) => {
                  const student = claim.student;
                  const cls = claim.class;
                  const isPending = claim.status === 'PENDING';
                  const isApproved = claim.status === 'APPROVED';
                  const isRejected = claim.status === 'REJECTED';

                  return (
                    <tr key={claim.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Mahasiswa */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{student?.name || 'Mahasiswa Tidak Dikenal'}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">NIM: {student?.nim || '-'}</div>
                        <div className="mt-1">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              student?.registration_status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            Akun: {student?.registration_status || 'UNKNOWN'}
                          </span>
                        </div>
                      </td>

                      {/* Kelas */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {cls?.study_program} {cls?.cohort_year}-{cls?.section}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Semester: {cls?.academic_term}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Status Kelas: {cls?.is_active ? 'Aktif' : 'Nonaktif'}
                        </div>
                      </td>

                      {/* Jenis Klaim */}
                      <td className="py-3 px-4">
                        {claim.claim_type === 'INITIAL' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            Klaim Awal (INITIAL)
                          </span>
                        )}
                        {claim.claim_type === 'REPLACEMENT' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Penggantian (REPLACEMENT)
                          </span>
                        )}
                        {claim.claim_type === 'TRANSFER' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                            Pengalihan (TRANSFER)
                          </span>
                        )}
                      </td>

                      {/* Status & Waktu */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {isPending && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3" /> Menunggu
                            </span>
                          )}
                          {isApproved && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Disetujui
                            </span>
                          )}
                          {isRejected && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3 h-3" /> Ditolak
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Diajukan: {formatWib(claim.created_at)}
                        </div>
                        {claim.decided_at && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Diputuskan: {formatWib(claim.decided_at)} oleh {claim.decided_by_staff?.name || 'Petugas'}
                          </div>
                        )}
                      </td>

                      {/* Catatan */}
                      <td className="py-3 px-4 max-w-xs">
                        <p className="text-slate-700 truncate" title={claim.notes || '-'}>
                          {claim.notes || '-'}
                        </p>
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenDecisionModal(claim, 'APPROVED')}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => handleOpenDecisionModal(claim, 'REJECTED')}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
                            >
                              Tolak
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Selesai diputuskan</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Decision Modal */}
      {decisionModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="decision-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                {decisionModal.type === 'APPROVED' ? (
                  <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                    <UserCheck className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
                    <XCircle className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h3 id="decision-modal-title" className="text-base font-bold text-slate-900">
                    {decisionModal.type === 'APPROVED' ? 'Setujui Klaim Ketua Kelas' : 'Tolak Klaim Ketua Kelas'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {decisionModal.claim.claim_type === 'INITIAL' ? 'Klaim Calon Ketua Awal' : 'Permintaan Penggantian Ketua'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseDecisionModal}
                disabled={isSubmitting}
                aria-label="Tutup modal"
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama Mahasiswa:</span>
                  <span className="font-semibold text-slate-900">{decisionModal.claim.student?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NIM:</span>
                  <span className="font-mono text-slate-900">{decisionModal.claim.student?.nim}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kelas Tujuan:</span>
                  <span className="font-medium text-slate-900">
                    {decisionModal.claim.class?.study_program} {decisionModal.claim.class?.cohort_year}-{decisionModal.claim.class?.section}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Semester:</span>
                  <span className="font-mono text-slate-900">{decisionModal.claim.class?.academic_term}</span>
                </div>
              </div>

              {decisionModal.type === 'APPROVED' && decisionModal.claim.claim_type === 'REPLACEMENT' && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-[11px] flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    <strong>Peringatan Penggantian:</strong> Menyetujui klaim ini akan mencabut status ketua kelas dari pejabat lama dan otomatis menaikkan versi token QR ketua lama agar tidak berlaku lagi.
                  </span>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Catatan Keputusan Petugas {decisionModal.type === 'REJECTED' && <span className="text-rose-600">*</span>}:
                </label>
                <textarea
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder={
                    decisionModal.type === 'APPROVED'
                      ? 'Catatan opsional persetujuan...'
                      : 'Alasan penolakan klaim (wajib)...'
                  }
                  rows={3}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {actionFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    actionFeedback.isError
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {actionFeedback.isError ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span>{actionFeedback.message}</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCloseDecisionModal}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitDecision}
                disabled={isSubmitting || (decisionModal.type === 'REJECTED' && !decisionNotes.trim())}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                  decisionModal.type === 'APPROVED'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Menyimpan...
                  </>
                ) : decisionModal.type === 'APPROVED' ? (
                  'Konfirmasi Persetujuan'
                ) : (
                  'Konfirmasi Penolakan'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
