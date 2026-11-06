'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ClassOption {
  id: string;
  study_program: string;
  cohort_year: number;
  section: string;
  academic_term: string;
}

export default function RegistrationForm() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  const [name, setName] = useState('');
  const [nim, setNim] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classId, setClassId] = useState('');
  const [consent, setConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    claimType: string;
    isEmailConfirmed: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadClasses() {
      try {
        const res = await fetch('/api/classes');
        const data = await res.json();
        if (res.ok && data.data) {
          setClasses(data.data);
          if (data.data.length > 0) {
            setClassId(data.data[0].id);
          }
        }
      } catch {
        setError('Gagal memuat daftar kelas baku. Silakan muat ulang halaman.');
      } finally {
        setLoadingClasses(false);
      }
    }
    loadClasses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!consent) {
      setError('Persetujuan eksplisit pengambilan foto di meja TU wajib dicentang.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          nim,
          email,
          password,
          class_id: classId,
          consent,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Registrasi gagal.');
      } else {
        setSuccessData({
          claimType: data.data.claim_type,
          isEmailConfirmed: data.data.is_email_confirmed,
          message: data.data.message,
        });
      }
    } catch {
      setError('Gangguan jaringan saat menghubungi server.');
    } finally {
      setSubmitting(false);
    }
  };

  if (successData) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xl font-bold">
          ✓
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">Registrasi Berhasil!</h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
          {successData.message}
        </p>

        <div className="mt-6 rounded-xl bg-white p-4 text-left border border-emerald-100 max-w-md mx-auto space-y-2 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">Langkah berikutnya:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-600">
            <li>Buka email Anda dan klik tautan konfirmasi email.</li>
            <li>Setelah email terverifikasi, datang ke meja TU Ruang Perlengkapan.</li>
            <li>Bawa kartu identitas fisik (KTM atau KTP, perlakuan setara).</li>
            <li>Petugas TU akan mengambil foto wajah referensi dan memotret dokumen identitas.</li>
          </ol>
          {successData.claimType === 'REPLACEMENT' && (
            <p className="text-amber-700 bg-amber-50 p-2 rounded-lg mt-2 font-medium">
              Catatan: Kelas Anda sudah memiliki ketua terdaftar. Pengajuan Anda tercatat sebagai permintaan penggantian ketua kelas (REPLACEMENT) dan menunggu keputusan petugas TU.
            </p>
          )}
        </div>

        <div className="mt-8">
          <Link
            href="/login"
            className="inline-block px-6 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm"
          >
            Menuju Halaman Masuk
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Nama Lengkap (Sesuai Identitas)
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama lengkap mahasiswa"
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={submitting}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Nomor Induk Mahasiswa (NIM)
          </label>
          <input
            type="text"
            required
            value={nim}
            onChange={(e) => setNim(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Contoh: 4223121001"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={submitting}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Alamat Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={submitting}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Kata Sandi Akun
        </label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimal 6 karakter"
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={submitting}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Pilihan Kelas Baku (Prodi / Angkatan / Rombel / Semester)
        </label>
        {loadingClasses ? (
          <div className="py-2 text-xs text-slate-400">Memuat pilihan kelas baku...</div>
        ) : classes.length === 0 ? (
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
            Belum ada kelas aktif yang terdaftar. Silakan hubungi petugas/admin TU.
          </div>
        ) : (
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            disabled={submitting}
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.study_program} — Angkatan {cls.cohort_year} — Kelas {cls.section} ({cls.academic_term})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Persetujuan Eksplisit Privasi (NFR-05) */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            disabled={submitting}
          />
          <span className="text-xs text-slate-600 leading-relaxed">
            <strong>Pernyataan Privasi & Persetujuan Eksplisit:</strong> Saya memahami bahwa SmartProjex memerlukan pengambilan foto wajah referensi dan foto dokumen identitas (KTM atau KTP) di meja TU semata-mata untuk verifikasi identitas peminjaman proyektor secara tatap muka oleh petugas. Foto dokumen akan dihapus segera setelah diverifikasi dan tidak ada data NIK yang disimpan.
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting || loadingClasses}
        className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 shadow-sm"
      >
        {submitting ? 'Mendaftarkan Akun...' : 'Daftar sebagai Ketua Kelas'}
      </button>
    </form>
  );
}

