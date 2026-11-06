'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import VerificationCapture from '@/components/admin/VerificationCapture';

interface QueueStudent {
  id: string;
  nim: string;
  name: string;
  email: string;
  registration_status: string;
  profile_photo_path: string | null;
  verification_document_path: string | null;
  verification_document_type: string | null;
  verification_notes: string | null;
  created_at: string;
  is_duplicate_nim: boolean;
  has_active_nim_conflict: boolean;
  duplicate_nim_count: number;
  current_class?: {
    id: string;
    study_program: string;
    cohort_year: number;
    section: string;
    academic_term: string;
  } | null;
  claims?: Array<{
    id: string;
    claim_type: string;
    status: string;
  }>;
}

export default function AdminVerificationsPage() {
  const [queue, setQueue] = useState<QueueStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [selectedStudent, setSelectedStudent] = useState<QueueStudent | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/verifications?status=${statusFilter}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Gagal memuat antrean verifikasi.');
      } else {
        setQueue(data.data || []);
      }
    } catch {
      setError('Gangguan jaringan saat memuat antrean.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return (
    <div className="min-h-screen p-6 md:p-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                Meja TU
              </span>
              <h1 className="text-2xl font-bold text-slate-900">Antrean Verifikasi Tatap Muka</h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Pencocokan manual foto wajah, foto dokumen (KTM/KTP setara), dan konfirmasi ketua kelas.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50"
            >
              ← Kembali ke Dashboard
            </Link>
            <button
              onClick={fetchQueue}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700"
            >
              Segarkan Antrean
            </button>
          </div>
        </div>

        {/* Modal / Panel Verifikasi Aktif */}
        {selectedStudent && (
          <div className="mt-6 mb-8">
            <VerificationCapture
              studentId={selectedStudent.id}
              studentName={selectedStudent.name}
              studentNim={selectedStudent.nim}
              existingFacePath={selectedStudent.profile_photo_path}
              existingDocPath={selectedStudent.verification_document_path}
              onDecisionSubmitted={() => {
                setSelectedStudent(null);
                fetchQueue();
              }}
              onCancel={() => setSelectedStudent(null)}
            />
          </div>
        )}

        {/* Filter Status */}
        <div className="mt-6 flex flex-wrap gap-2">
          {['ALL', 'PENDING_DOCUMENT', 'PENDING_REVIEW', 'RESUBMISSION_REQUIRED', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                statusFilter === st
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {st === 'ALL'
                ? 'Semua Antrean Terbuka'
                : st === 'PENDING_DOCUMENT'
                ? 'Menunggu Foto di TU'
                : st === 'PENDING_REVIEW'
                ? 'Siap Diperiksa'
                : st === 'RESUBMISSION_REQUIRED'
                ? 'Perlu Foto Ulang'
                : 'Ditolak'}
            </button>
          ))}
        </div>

        {/* Tabel Antrean */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">Memuat antrean verifikasi mahasiswa...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-600">{error}</div>
          ) : queue.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Tidak ada mahasiswa yang menunggu verifikasi saat ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Nama Mahasiswa</th>
                    <th className="py-3 px-4">NIM</th>
                    <th className="py-3 px-4">Kelas yang Dipilih</th>
                    <th className="py-3 px-4">Tipe Klaim</th>
                    <th className="py-3 px-4">Status Akun</th>
                    <th className="py-3 px-4">Catatan</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {queue.map((student) => {
                    const latestClaim = student.claims?.[0];
                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-900">{student.name}</p>
                          <p className="text-[11px] text-slate-500">{student.email}</p>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-800">
                          {student.nim}
                          {student.is_duplicate_nim && (
                            <span
                              title={`Terdeteksi ${student.duplicate_nim_count} akun dengan NIM ini. ${
                                student.has_active_nim_conflict ? 'Sudah ada akun ACTIVE dengan NIM ini!' : ''
                              }`}
                              className="ml-2 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 border border-red-200"
                            >
                              Duplikasi NIM ({student.duplicate_nim_count})
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">
                          {student.current_class ? (
                            <div>
                              <p className="font-medium text-slate-900">{student.current_class.study_program}</p>
                              <p className="text-[11px] text-slate-500">
                                Angkatan {student.current_class.cohort_year} — Kelas {student.current_class.section} ({student.current_class.academic_term})
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Belum memilih</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {latestClaim ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                latestClaim.claim_type === 'INITIAL'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {latestClaim.claim_type === 'INITIAL' ? 'Calon Ketua (INITIAL)' : 'Penggantian (REPLACEMENT)'}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              student.registration_status === 'PENDING_DOCUMENT'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : student.registration_status === 'PENDING_REVIEW'
                                ? 'bg-blue-100 text-blue-800'
                                : student.registration_status === 'RESUBMISSION_REQUIRED'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {student.registration_status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate text-[11px]">
                          {student.verification_notes || '-'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedStudent(student)}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm"
                          >
                            Proses Verifikasi
                          </button>
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
    </div>
  );
}
