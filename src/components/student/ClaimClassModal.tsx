'use client';

import React from 'react';

export interface ClassOption {
  id: string;
  study_program: string;
  cohort_year: number;
  section: string;
  academic_term: string;
}

export interface ClaimClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableClasses: ClassOption[];
  loadingClasses: boolean;
  selectedClassId: string;
  onSelectClassId: (id: string) => void;
  claimNotes: string;
  onChangeNotes: (notes: string) => void;
  claimConsentConfirmed: boolean;
  onToggleConsent: (confirmed: boolean) => void;
  isSubmittingClaim: boolean;
  claimError: string | null;
  claimSuccess: boolean;
  claimSuccessMessage: string | null;
  onSubmit: () => void;
}

export default function ClaimClassModal({
  isOpen,
  onClose,
  availableClasses,
  loadingClasses,
  selectedClassId,
  onSelectClassId,
  claimNotes,
  onChangeNotes,
  claimConsentConfirmed,
  onToggleConsent,
  isSubmittingClaim,
  claimError,
  claimSuccess,
  claimSuccessMessage,
  onSubmit,
}: ClaimClassModalProps) {
  if (!isOpen) return null;

  const selectedClass = availableClasses.find((c) => c.id === selectedClassId) || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
        {!claimSuccess ? (
          <>
            <div className="text-center space-y-1">
              <span className="text-2xl" role="img" aria-label="Topi Wisuda">
                🎓
              </span>
              <h3 id="claim-modal-title" className="text-base font-bold text-slate-900">
                Klaim Ketua Kelas Semester Baru
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Pilih rombel dan semester akademik yang Anda wakili. Mahasiswa aktif tidak perlu mengunggah ulang foto identitas (FR-01F).
              </p>
            </div>

            {claimError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              >
                {claimError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="select-class" className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Kelas Akademik Aktif:
                </label>
                {loadingClasses ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    Memuat daftar kelas aktif...
                  </div>
                ) : availableClasses.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 text-center">
                    Tidak ada kelas aktif yang tersedia untuk diklaim. Hubungi staf TU.
                  </div>
                ) : (
                  <select
                    id="select-class"
                    value={selectedClassId}
                    onChange={(e) => onSelectClassId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {availableClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.study_program} ({c.cohort_year} - {c.section}) • {c.academic_term}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedClass && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Program Studi:</span>
                    <span className="font-semibold text-slate-800">{selectedClass.study_program}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Angkatan / Rombel:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedClass.cohort_year} - {selectedClass.section}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Semester Akademik:</span>
                    <span className="font-semibold text-blue-700">{selectedClass.academic_term}</span>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="claim-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan / Bukti Pendukung (Opsional):
                </label>
                <textarea
                  id="claim-notes"
                  value={claimNotes}
                  onChange={(e) => onChangeNotes(e.target.value)}
                  placeholder="Contoh: Terpilih sebagai ketua kelas pada musyawarah kelas semester ganjil 2025/2026..."
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Consent Checkbox */}
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={claimConsentConfirmed}
                    onChange={(e) => onToggleConsent(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span className="text-[11px] leading-relaxed">
                    Saya menyatakan secara jujur bahwa saya adalah ketua kelas yang sah untuk rombel ini dan permohonan ini siap diverifikasi oleh petugas TU Fakultas.
                  </span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmittingClaim}
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={
                  isSubmittingClaim ||
                  !selectedClassId ||
                  !claimConsentConfirmed ||
                  availableClasses.length === 0
                }
                onClick={onSubmit}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isSubmittingClaim ? 'Mengirim...' : 'Kirim Permohonan Klaim'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center space-y-4 py-4">
            <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-xl">
              ✓
            </div>
            <h3 className="text-base font-bold text-slate-900">Permohonan Klaim Berhasil Dikirim!</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {claimSuccessMessage ||
                'Permohonan klaim ketua kelas telah tercatat dan akan diverifikasi oleh petugas TU.'}
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-[11px] text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700">Langkah berikutnya:</p>
              <p>1. Petugas TU akan meninjau dan memverifikasi permohonan di dashboard admin.</p>
              <p>2. Setelah disetujui, QR Pass peminjaman kelas baru akan langsung aktif di halaman ini.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
            >
              Tutup &amp; Kembali
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
