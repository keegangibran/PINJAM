'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PasswordInput from '@/components/ui/PasswordInput';
import FaceCaptureStep from './FaceCaptureStep';
import DocumentCaptureStep from './DocumentCaptureStep';
import ReviewStep from './ReviewStep';
import { Mail, CheckCircle2, Clock, AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react';

interface ClassOption {
  id: string;
  study_program: string;
  cohort_year: number;
  section: string;
  academic_term: string;
}

type RegistrationFlowStep = 1 | 'EMAIL_VERIFICATION' | 2 | 3 | 4 | 'SUCCESS' | 'ACTIVE_NOTICE';

export default function RegistrationForm() {
  const [currentStep, setCurrentStep] = useState<RegistrationFlowStep>(1);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  // Form Fields (Tahap 1)
  const [name, setName] = useState('');
  const [nim, setNim] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classId, setClassId] = useState('');
  const [consent, setConsent] = useState(false);

  // Photos State (Tahap 2 & 3)
  const [facePhoto, setFacePhoto] = useState<string | null>(null);
  const [documentPhoto, setDocumentPhoto] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<'KTM' | 'KTP'>('KTM');

  // Existing Profile / Resubmission State
  const [resubmissionNotes, setResubmissionNotes] = useState<string | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimType, setClaimType] = useState<string | null>(null);

  // Periksa apakah pengguna saat ini sudah memiliki akun / profil mahasiswa
  const checkProfileStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/students/profile');
      const json = await res.json();

      if (res.ok && json.authenticated && json.data) {
        const student = json.data;
        setName(student.name || '');
        setNim(student.nim || '');
        setEmail(student.email || '');
        if (student.current_class_id) {
          setClassId(student.current_class_id);
        }

        if (student.registration_status === 'ACTIVE') {
          setCurrentStep('ACTIVE_NOTICE');
        } else if (student.registration_status === 'UNVERIFIED_EMAIL') {
          setCurrentStep('EMAIL_VERIFICATION');
        } else if (
          student.registration_status === 'PENDING_DOCUMENT' ||
          student.registration_status === 'RESUBMISSION_REQUIRED'
        ) {
          if (student.verification_notes) {
            setResubmissionNotes(student.verification_notes);
          }
          // Siap untuk langsung mengambil foto wajah
          setCurrentStep(2);
        } else if (student.registration_status === 'PENDING_REVIEW') {
          setCurrentStep('SUCCESS');
        }
      }
    } catch {
      // Abaikan jika belum login
    } finally {
      setCheckingExisting(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/classes');
        const data = await res.json();
        if (res.ok && data.data) {
          setClasses(data.data);
          if (data.data.length > 0) {
            setClassId((prev) => prev || data.data[0].id);
          }
        }
      } catch {
        setError('Gagal memuat daftar kelas baku. Silakan muat ulang halaman.');
      } finally {
        setLoadingClasses(false);
      }
      await checkProfileStatus();
    }
    init();
  }, [checkProfileStatus]);

  // Submit Tahap 1: Pendaftaran Akun & Profil Mahasiswa
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!consent) {
      setError('Persetujuan eksplisit pengambilan foto wajib dicentang.');
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
          password: password || undefined,
          class_id: classId,
          consent,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Registrasi gagal.');
      } else {
        setClaimType(data.data.claim_type);
        if (data.data.is_email_confirmed) {
          // Email sudah terkonfirmasi otomatis: Lanjut ke Tahap 2 (Foto Wajah)
          setCurrentStep(2);
        } else {
          // Perlu verifikasi email
          setCurrentStep('EMAIL_VERIFICATION');
        }
      }
    } catch {
      setError('Gangguan jaringan saat menghubungi server.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Tahap 4: Pengiriman Akhir Foto Verifikasi ke Admin
  const handleFinalSubmit = async () => {
    if (!facePhoto || !documentPhoto) {
      setError('Foto wajah dan foto kartu identitas wajib diambil terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/students/me/verification-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          face_photo_base64: facePhoto,
          document_photo_base64: documentPhoto,
          document_type: documentType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Gagal mengirimkan permohonan verifikasi.');
      } else {
        setCurrentStep('SUCCESS');
      }
    } catch {
      setError('Terjadi gangguan jaringan saat mengirimkan foto ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedClassObj = classes.find((c) => c.id === classId);
  const classNameStr = selectedClassObj
    ? `${selectedClassObj.study_program} — Angkatan ${selectedClassObj.cohort_year} (${selectedClassObj.section})`
    : 'Kelas Akademik';

  if (checkingExisting) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        Memeriksa status pendaftaran Anda...
      </div>
    );
  }

  // State: Akun Sudah ACTIVE
  if (currentStep === 'ACTIVE_NOTICE') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 sm:p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xl font-bold">
          ✓
        </div>
        <h2 className="text-xl font-bold text-slate-900">Akun Anda Sudah Aktif</h2>
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          Akun mahasiswa Anda atas nama <strong>{name}</strong> ({nim}) telah terverifikasi secara penuh (ACTIVE). Anda dapat langsung menggunakan QR Pass untuk meminjam proyektor.
        </p>
        <div className="pt-2">
          <Link
            href="/my-qr"
            className="inline-flex items-center gap-1.5 px-6 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm"
          >
            <span>Buka QR Pass Saya</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  // State: Verifikasi Email Diperlukan
  if (currentStep === 'EMAIL_VERIFICATION') {
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-6 sm:p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <Mail size={24} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Verifikasi Email Diperlukan</h2>
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          Tautan konfirmasi telah dikirimkan ke <strong>{email}</strong>. Silakan buka kotak masuk email Anda dan klik tautan verifikasi.
        </p>

        <div className="rounded-xl bg-white p-4 border border-blue-100 max-w-md mx-auto text-left text-xs text-slate-600 space-y-2">
          <p className="font-semibold text-slate-800">Petunjuk:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Buka email dari PINJAM / Supabase.</li>
            <li>Klik tombol atau tautan verifikasi di dalam email.</li>
            <li>Setelah email terverifikasi, klik tombol di bawah untuk melanjutkan ke tahap foto.</li>
          </ol>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={checkProfileStatus}
            className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center justify-center gap-1.5"
          >
            <RotateCcw size={14} />
            <span>Saya Sudah Verifikasi Email, Lanjutkan</span>
          </button>
          <Link
            href="/login"
            className="w-full sm:w-auto px-4 py-2.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold rounded-xl"
          >
            Masuk ke Akun
          </Link>
        </div>
      </div>
    );
  }

  // State: Tahap 2 — Pengambilan Foto Wajah Mandiri
  if (currentStep === 2) {
    return (
      <div className="space-y-4">
        {resubmissionNotes && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Permintaan Perbaikan dari Admin TU:</p>
              <p className="mt-0.5 text-amber-700 leading-relaxed">{resubmissionNotes}</p>
            </div>
          </div>
        )}

        <FaceCaptureStep
          initialPhotoUrl={facePhoto}
          onPhotoAccepted={(dataUrl) => {
            setFacePhoto(dataUrl);
            setCurrentStep(3);
          }}
          onBack={() => setCurrentStep(1)}
        />
      </div>
    );
  }

  // State: Tahap 3 — Pengambilan Foto Kartu Identitas
  if (currentStep === 3) {
    return (
      <DocumentCaptureStep
        initialPhotoUrl={documentPhoto}
        initialDocType={documentType}
        onPhotoAccepted={(dataUrl, docType) => {
          setDocumentPhoto(dataUrl);
          setDocumentType(docType);
          setCurrentStep(4);
        }}
        onBack={() => setCurrentStep(2)}
      />
    );
  }

  // State: Tahap 4 — Pemeriksaan Sebelum Pengiriman
  if (currentStep === 4 && facePhoto && documentPhoto) {
    return (
      <ReviewStep
        studentData={{
          name,
          nim,
          email,
          className: classNameStr,
        }}
        facePhotoUrl={facePhoto}
        documentPhotoUrl={documentPhoto}
        documentType={documentType}
        submitting={submitting}
        error={error}
        onEditData={() => setCurrentStep(1)}
        onRetakeFace={() => setCurrentStep(2)}
        onRetakeDocument={() => setCurrentStep(3)}
        onSubmit={handleFinalSubmit}
      />
    );
  }

  // State: Sukses / Menunggu Pemeriksaan Admin (PENDING_REVIEW)
  if (currentStep === 'SUCCESS') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 sm:p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xl font-bold">
          ✓
        </div>
        <h2 className="text-xl font-bold text-slate-900">Permohonan Verifikasi Terkirim!</h2>
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          Foto wajah dan kartu identitas Anda telah berhasil diterima oleh sistem PINJAM.
        </p>

        <div className="rounded-xl bg-white p-4 text-left border border-emerald-100 max-w-md mx-auto space-y-2.5 text-xs text-slate-600">
          <div className="flex items-center gap-2 text-slate-900 font-semibold border-b border-slate-100 pb-2">
            <Clock size={15} className="text-blue-600" />
            <span>Status: Menunggu Pemeriksaan Admin / TU</span>
          </div>
          <p className="leading-relaxed">
            Petugas TU akan memeriksa permohonan Anda secara manual dengan mencocokkan:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Kesesuaian visual wajah Anda dengan foto kartu identitas ({documentType}).</li>
            <li>Kesesuaian nama terdaftar ({name}) dengan nama pada kartu identitas.</li>
            <li>Kelayakan Anda sebagai ketua kelas pada kelas yang dipilih.</li>
          </ul>
          <p className="text-slate-500 pt-1 text-[11px]">
            Foto kartu identitas Anda akan dihapus secara otomatis dan permanen segera setelah keputusan admin ditetapkan.
          </p>
          {claimType === 'REPLACEMENT' && (
            <p className="text-amber-800 bg-amber-50 p-2.5 rounded-lg font-medium">
              Catatan: Kelas Anda sudah memiliki ketua terdaftar. Pengajuan Anda tercatat sebagai penggantian ketua kelas (REPLACEMENT) dan menunggu penetapan petugas TU.
            </p>
          )}
        </div>

        <div className="pt-4 flex justify-center gap-3">
          <Link
            href="/login"
            className="px-6 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm"
          >
            Menuju Halaman Masuk
          </Link>
        </div>
      </div>
    );
  }

  // Default: Tahap 1 — Pengisian Data Mahasiswa
  return (
    <form onSubmit={handleStep1Submit} className="space-y-4">
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
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
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

      {/* Persetujuan Eksplisit Privasi */}
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
            <strong>Pernyataan Privasi & Persetujuan Eksplisit:</strong> Saya memahami bahwa sistem PINJAM memerlukan pengambilan foto wajah mandiri dan foto kartu identitas fisik (KTM atau KTP setara) menggunakan kamera perangkat saya semata-mata untuk verifikasi identitas ketua kelas oleh petugas TU. Foto kartu identitas akan dihapus segera setelah diverifikasi dan tidak ada data NIK yang disimpan.
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting || loadingClasses}
        className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
      >
        <span>{submitting ? 'Memproses Pendaftaran...' : 'Lanjut ke Pengambilan Foto Mandiri'}</span>
        <ArrowRight size={15} />
      </button>
    </form>
  );
}
