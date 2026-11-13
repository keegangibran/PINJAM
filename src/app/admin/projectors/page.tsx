/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { formatWib } from '@/lib/timezone';

interface ProjectorItem {
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

interface StatusLog {
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

export default function AdminProjectorsPage() {
  const [projectors, setProjectors] = useState<ProjectorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  // Modal Add
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ code: '', name: '', notes: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Modal Edit / Deactivate
  const [editingProjector, setEditingProjector] = useState<ProjectorItem | null>(null);
  const [editForm, setEditForm] = useState({ name: '', notes: '', status: 'AVAILABLE' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal Status Maintenance
  const [statusProjector, setStatusProjector] = useState<ProjectorItem | null>(null);
  const [statusForm, setStatusForm] = useState<{
    targetStatus: 'AVAILABLE' | 'MAINTENANCE';
    reason: string;
    photoBase64: string | null;
  }>({ targetStatus: 'MAINTENANCE', reason: '', photoBase64: null });
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Modal Status History
  const [historyProjector, setHistoryProjector] = useState<ProjectorItem | null>(null);
  const [logs, setLogs] = useState<StatusLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // Modal QR Asset Sticker Print
  const [qrPrintProjector, setQrPrintProjector] = useState<ProjectorItem | null>(null);

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

  return (
    <div className="min-h-screen p-6 md:p-8 bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                Inventaris Aset
              </span>
              <h1 className="text-2xl font-bold text-slate-900">Manajemen Inventaris Proyektor</h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Pengelolaan unit fisik, pencetakan stiker QR aset, dan pelacakan status perawatan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin"
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm"
            >
              ← Kembali ke Dashboard
            </Link>
            <button
              type="button"
              onClick={() => void refreshProjectors()}
              disabled={loading || isRefreshing}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              title="Perbarui data inventaris terbaru dari server"
            >
              <svg
                className={`w-3.5 h-3.5 text-slate-500 ${loading || isRefreshing ? 'animate-spin text-blue-600' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>{loading || isRefreshing ? 'Memuat...' : 'Muat Ulang'}</span>
            </button>
            <button
              onClick={() => {
                setAddForm({ code: '', name: '', notes: '' });
                setAddError(null);
                setIsAddModalOpen(true);
              }}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition shadow-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Unit Baru
            </button>
          </div>
        </div>

        {/* Content Section */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500 shadow-sm">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-blue-600 mb-2"></div>
            <p>Memuat daftar inventaris proyektor...</p>
          </div>
        ) : projectors.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500 shadow-sm">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="font-semibold text-slate-700">Belum ada unit proyektor terdaftar</p>
            <p className="text-xs text-slate-400 mt-1">Gunakan tombol &quot;Tambah Unit Baru&quot; di atas untuk mendaftarkan aset proyektor pertama.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectors.map((p) => {
              const statusBadge =
                p.status === 'AVAILABLE' ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    Tersedia
                  </span>
                ) : p.status === 'BORROWED' ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                    Sedang Dipinjam
                  </span>
                ) : p.status === 'MAINTENANCE' ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                    Dalam Perawatan
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-600">
                    Nonaktif
                  </span>
                );

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between hover:border-slate-300 transition"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-xs font-bold text-slate-800 border border-slate-200">
                          {p.code}
                        </span>
                        <h3 className="font-bold text-slate-900 mt-1">{p.name}</h3>
                      </div>
                      <div>{statusBadge}</div>
                    </div>

                    {p.status === 'BORROWED' && p.active_loan && (
                      <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-lg text-xs text-blue-900 space-y-0.5">
                        <p className="font-medium">
                          Peminjam: {p.active_loan.student?.name || 'Mahasiswa'} (NIM {p.active_loan.student?.nim || '-'})
                        </p>
                        <p className="text-[11px] text-blue-700">
                          Batas kembali: {formatWib(p.active_loan.due_at, 'time')}
                        </p>
                      </div>
                    )}

                    {p.notes && (
                      <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-600">
                        <span className="font-medium text-slate-700">Catatan:</span> {p.notes}
                      </div>
                    )}
                  </div>

                  {/* Actions Grid */}
                  <div className="pt-4 mt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    {/* Cetak Stiker QR */}
                    <button
                      onClick={() => setQrPrintProjector(p)}
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded-lg border border-slate-200 transition flex items-center justify-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      Stiker QR
                    </button>

                    {/* Riwayat Status */}
                    <button
                      onClick={() => openHistoryModal(p)}
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded-lg border border-slate-200 transition flex items-center justify-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Riwayat
                    </button>

                    {/* Ubah Status / Maintenance (Available / Maintenance) */}
                    <button
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
                      className={`px-2.5 py-1.5 font-medium rounded-lg border transition flex items-center justify-center gap-1 ${
                        p.status === 'BORROWED' || p.status === 'INACTIVE'
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                          : p.status === 'MAINTENANCE'
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {p.status === 'MAINTENANCE' ? 'Set Siap Pakai' : 'Lapor Perawatan'}
                    </button>

                    {/* Edit / Nonaktifkan */}
                    <button
                      onClick={() => {
                        setEditingProjector(p);
                        setEditForm({
                          name: p.name,
                          notes: p.notes || '',
                          status: p.status === 'INACTIVE' ? 'INACTIVE' : 'AVAILABLE',
                        });
                        setEditError(null);
                      }}
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded-lg border border-slate-200 transition flex items-center justify-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Kelola Unit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal 1: Add Projector */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Tambah Unit Proyektor Baru</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kode Proyektor (Unik, mis. PROJ-01) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="PROJ-01"
                  value={addForm.code}
                  onChange={(e) => setAddForm({ ...addForm, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono uppercase bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama / Tipe Proyektor *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Epson EB-X400 #1"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Kondisi baru, kabel HDMI bawaan lengkap..."
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition shadow-sm disabled:opacity-50"
                >
                  {addLoading ? 'Menyimpan...' : 'Simpan Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Edit / Deactivate Projector */}
      {editingProjector && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Kelola Unit Proyektor</h3>
                <p className="text-xs font-mono text-slate-500">{editingProjector.code}</p>
              </div>
              <button
                onClick={() => setEditingProjector(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama / Tipe Proyektor *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Unit
                </label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900"
                />
              </div>

              {/* Status Nonaktif Switch */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Status Keaktifan Aset</p>
                    <p className="text-[11px] text-slate-500">Unit nonaktif tidak dapat dipinjam di Kiosk.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditForm((prev) => ({
                        ...prev,
                        status: prev.status === 'INACTIVE' ? 'AVAILABLE' : 'INACTIVE',
                      }))
                    }
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      editForm.status === 'INACTIVE'
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {editForm.status === 'INACTIVE' ? 'Nonaktif' : 'Aktif'}
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProjector(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition shadow-sm disabled:opacity-50"
                >
                  {editLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Maintenance Status Change (FR-09) */}
      {statusProjector && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {statusForm.targetStatus === 'MAINTENANCE'
                    ? 'Lapor Perawatan / Kerusakan Unit'
                    : 'Kembalikan Unit ke Siap Pakai'}
                </h3>
                <p className="text-xs font-mono text-slate-500">
                  {statusProjector.code} - {statusProjector.name}
                </p>
              </div>
              <button
                onClick={() => setStatusProjector(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {statusError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {statusError}
              </div>
            )}

            <form onSubmit={handleStatusSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status Baru:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusForm((prev) => ({ ...prev, targetStatus: 'AVAILABLE' }))}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                      statusForm.targetStatus === 'AVAILABLE'
                        ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Tersedia (Siap Pakai)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusForm((prev) => ({ ...prev, targetStatus: 'MAINTENANCE' }))}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                      statusForm.targetStatus === 'MAINTENANCE'
                        ? 'bg-amber-100 border-amber-400 text-amber-800'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Dalam Perawatan
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Perubahan Status *
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900"
                />
              </div>

              {/* Upload Foto Kendala Opsional */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Foto Dokumentasi Kendala (Opsional, max 250 KB)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />
                {statusForm.photoBase64 && (
                  <div className="mt-2 aspect-video w-32 rounded-lg border border-slate-200 overflow-hidden bg-slate-100">
                    <img
                      src={statusForm.photoBase64}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStatusProjector(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={statusLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition shadow-sm disabled:opacity-50"
                >
                  {statusLoading ? 'Memproses...' : 'Perbarui Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Status History Timeline (FR-09) */}
      {historyProjector && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Riwayat Perubahan Status</h3>
                <p className="text-xs font-mono text-slate-500">
                  {historyProjector.code} - {historyProjector.name}
                </p>
              </div>
              <button
                onClick={() => setHistoryProjector(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {logsLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-blue-600 mb-2"></div>
                <p>Memuat catatan kronologis...</p>
              </div>
            ) : logsError ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {logsError}
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada riwayat perubahan status untuk unit ini.
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {log.from_status} → {log.to_status}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {formatWib(log.created_at, 'full')}
                      </span>
                    </div>
                    {log.reason && (
                      <p className="text-slate-600 mt-1">
                        <span className="font-medium text-slate-700">Alasan:</span> {log.reason}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1">
                      Diproses oleh: {log.staff?.name || 'Sistem / Transaksi Kiosk'}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setHistoryProjector(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-medium transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Printable QR Asset Sticker Tag (FR-10, FT-03) */}
      {qrPrintProjector && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 print:hidden">
              <h3 className="text-lg font-bold text-slate-900">Stiker QR Aset Proyektor</h3>
              <button
                onClick={() => setQrPrintProjector(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Printable Sticker Card */}
            <div
              id="printable-qr-tag"
              className="p-6 bg-white border-2 border-dashed border-slate-400 rounded-2xl flex flex-col items-center text-center space-y-3"
            >
              <div className="border-b border-slate-200 pb-2 w-full">
                <p className="text-[10px] tracking-widest uppercase font-bold text-slate-500">
                  PINJAM ASSET TAG
                </p>
                <h4 className="text-xl font-black font-mono text-slate-900 mt-0.5">
                  {qrPrintProjector.code}
                </h4>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
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

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2 print:hidden">
              <button
                onClick={() => setQrPrintProjector(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-medium transition"
              >
                Tutup
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition shadow-sm flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Cetak Stiker
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
