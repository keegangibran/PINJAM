'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { compressCanvasToDataUrl, calculateTargetDimensions } from '@/lib/image';
import { CheckCircle2, XCircle, RotateCcw, AlertTriangle, ShieldCheck, Camera, User, Mail, GraduationCap } from 'lucide-react';

interface VerificationCaptureProps {
  studentId: string;
  studentName: string;
  studentNim: string;
  studentEmail?: string;
  studentClass?: string;
  studentRegistrationStatus?: string;
  documentType?: 'KTM' | 'KTP' | null;
  existingFacePath?: string | null;
  existingDocPath?: string | null;
  onDecisionSubmitted: () => void;
  onCancel: () => void;
}

export default function VerificationCapture({
  studentId,
  studentName,
  studentNim,
  studentEmail,
  studentClass,
  studentRegistrationStatus = 'PENDING_REVIEW',
  documentType: initialDocType,
  existingFacePath,
  existingDocPath,
  onDecisionSubmitted,
  onCancel,
}: VerificationCaptureProps) {
  const [step, setStep] = useState<'CAPTURE' | 'INSPECT'>('INSPECT');
  const [activeCaptureMode, setActiveCaptureMode] = useState<'FACE' | 'DOCUMENT'>('FACE');
  const [docType, setDocType] = useState<'KTM' | 'KTP'>(initialDocType || 'KTM');

  const [faceUrl, setFaceUrl] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState<boolean>(true);

  // Kamera State (jika TU ingin mengambil ulang di meja TU)
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // 3 Centang Pemeriksaan Manual (FR-01B, Sesuai Kebutuhan Bagian 3)
  const [faceMatch, setFaceMatch] = useState(false);
  const [nameMatch, setNameMatch] = useState(false);
  const [statusConfirmed, setStatusConfirmed] = useState(false);
  const [notes, setNotes] = useState('');

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Ambil Signed URLs untuk foto yang diunggah oleh mahasiswa
  useEffect(() => {
    let isMounted = true;

    async function loadSignedPhotos() {
      setLoadingPhotos(true);
      setErrorMessage(null);

      try {
        let signedFace: string | null = null;
        let signedDoc: string | null = null;

        if (existingFacePath) {
          const res = await fetch('/api/admin/photos/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: existingFacePath }),
          });
          const data = await res.json();
          if (res.ok && data.data?.signedUrl) {
            signedFace = data.data.signedUrl;
          }
        }

        if (existingDocPath) {
          const res = await fetch('/api/admin/photos/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: existingDocPath }),
          });
          const data = await res.json();
          if (res.ok && data.data?.signedUrl) {
            signedDoc = data.data.signedUrl;
          }
        }

        if (isMounted) {
          setFaceUrl(signedFace);
          setDocUrl(signedDoc);

          // Jika kedua foto tersedia, langsung masuk mode INSPECT
          if (signedFace && signedDoc) {
            setStep('INSPECT');
          } else if (!signedFace && !signedDoc) {
            // Jika belum ada foto sama sekali, masuk ke CAPTURE meja TU
            setStep('CAPTURE');
          } else {
            setStep('INSPECT');
          }
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Gagal memuat foto terenkripsi dari server.');
        }
      } finally {
        if (isMounted) {
          setLoadingPhotos(false);
        }
      }
    }

    loadSignedPhotos();

    return () => {
      isMounted = false;
    };
  }, [existingFacePath, existingDocPath]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError('Tidak dapat mengakses webcam laptop. Pastikan izin kamera telah diberikan.');
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (step === 'CAPTURE') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [step, startCamera, stopCamera]);

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    const { width, height } = calculateTargetDimensions(video.videoWidth || 1280, video.videoHeight || 720, 1280);
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // DILARANG mirror / scaleX(-1)
    ctx.drawImage(video, 0, 0, width, height);

    const { dataUrl } = await compressCanvasToDataUrl(canvas, {
      maxDimension: 1280,
      initialQuality: 0.85,
      targetMaxBytes: 250 * 1024,
    });

    if (activeCaptureMode === 'FACE') {
      setFaceUrl(dataUrl);
      setActiveCaptureMode('DOCUMENT');
    } else {
      setDocUrl(dataUrl);
    }
  };

  const handleUploadAndProceed = async () => {
    if (!faceUrl || !docUrl) {
      setErrorMessage('Kedua foto (wajah referensi dan dokumen identitas) wajib diambil.');
      return;
    }

    // Jika foto adalah dataUrl (baru diambil di TU), upload via API
    if (faceUrl.startsWith('data:') || docUrl.startsWith('data:')) {
      setUploading(true);
      setErrorMessage(null);

      try {
        const res = await fetch(`/api/admin/verifications/${studentId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            face_photo_base64: faceUrl,
            document_photo_base64: docUrl,
            document_type: docType,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setErrorMessage(data.error?.message || 'Gagal mengunggah foto.');
          setUploading(false);
          return;
        }

        setStep('INSPECT');
      } catch {
        setErrorMessage('Terjadi gangguan jaringan saat mengunggah foto.');
      } finally {
        setUploading(false);
      }
    } else {
      setStep('INSPECT');
    }
  };

  const handleDecision = async (decision: 'APPROVE' | 'REJECT' | 'REQUEST_RESUBMISSION') => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/admin/verifications/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          checks: {
            face_match: faceMatch,
            name_match: nameMatch,
            status_confirmed: statusConfirmed,
          },
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error?.message || 'Gagal menyimpan keputusan verifikasi.');
        setSubmitting(false);
        return;
      }

      onDecisionSubmitted();
    } catch {
      setErrorMessage('Gangguan jaringan saat memproses keputusan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xl max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              Pemeriksaan Verifikasi Mahasiswa
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-600">
              {studentRegistrationStatus}
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-2">
            <span>{studentName}</span>
            <span className="font-mono text-sm text-slate-500 font-normal">({studentNim})</span>
          </h2>
        </div>
        <button
          onClick={onCancel}
          className="text-xs text-slate-500 hover:text-slate-800 font-medium px-3 py-1.5 rounded-lg border border-slate-200 self-start sm:self-auto"
        >
          Tutup Panel
        </button>
      </div>

      {/* Rincian Identitas Mahasiswa */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
        <div>
          <span className="text-slate-500 block">Alamat Email:</span>
          <span className="font-medium text-slate-900 flex items-center gap-1 mt-0.5">
            <Mail size={12} className="text-slate-400" />
            <span>{studentEmail || '-'}</span>
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Kelas Terdaftar:</span>
          <span className="font-medium text-slate-900 flex items-center gap-1 mt-0.5">
            <GraduationCap size={12} className="text-slate-400" />
            <span>{studentClass || '-'}</span>
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Dokumen Identitas:</span>
          <span className="font-semibold text-blue-700 block mt-0.5">
            {docType} (Kartu Identitas)
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle size={15} className="text-red-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {loadingPhotos ? (
        <div className="py-12 text-center text-xs text-slate-500">
          Memuat foto verifikasi mahasiswa secara aman...
        </div>
      ) : step === 'CAPTURE' ? (
        /* Mode Pengambilan Kamera Loket TU */
        <div className="space-y-6">
          <div className="flex gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setActiveCaptureMode('FACE')}
              className={`px-4 py-2 text-xs font-semibold rounded-xl ${
                activeCaptureMode === 'FACE' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              1. Foto Wajah {faceUrl ? '✓' : ''}
            </button>
            <button
              onClick={() => setActiveCaptureMode('DOCUMENT')}
              className={`px-4 py-2 text-xs font-semibold rounded-xl ${
                activeCaptureMode === 'DOCUMENT' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              2. Foto Dokumen ({docType}) {docUrl ? '✓' : ''}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative rounded-2xl bg-slate-900 overflow-hidden aspect-video flex items-center justify-center border border-slate-800">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'none' }}
              />
              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-900/90 text-white">
                  <p className="text-xs text-slate-400 mb-2">{cameraError || 'Kamera sedang dinonaktifkan'}</p>
                  <button
                    onClick={startCamera}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg"
                  >
                    Nyalakan Kamera
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50 flex flex-col items-center justify-center aspect-video relative">
              {activeCaptureMode === 'FACE' ? (
                faceUrl ? (
                  <img src={faceUrl} alt="Pratinjau Wajah" className="max-h-full object-contain rounded-xl" style={{ transform: 'none' }} />
                ) : (
                  <span className="text-xs text-slate-400">Belum ada foto wajah referensi</span>
                )
              ) : docUrl ? (
                <img src={docUrl} alt="Pratinjau Dokumen" className="max-h-full object-contain rounded-xl" style={{ transform: 'none' }} />
              ) : (
                <span className="text-xs text-slate-400">Belum ada foto dokumen identitas</span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={capturePhoto}
              className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1.5"
            >
              <Camera size={14} />
              <span>Ambil {activeCaptureMode === 'FACE' ? 'Foto Wajah' : 'Foto Dokumen'}</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('INSPECT')}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50"
              >
                Batal Kamera
              </button>
              <button
                type="button"
                onClick={handleUploadAndProceed}
                disabled={!faceUrl || !docUrl || uploading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50"
              >
                {uploading ? 'Menyimpan Foto...' : 'Lanjut ke Pemeriksaan →'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Mode Pemeriksaan Manual (INSPECT) */
        <div className="space-y-6">
          {/* Perbandingan Visual Berdampingan (Foto Wajah vs Foto Kartu) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
              <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-center gap-1.5">
                <User size={13} className="text-blue-600" />
                <span>Foto Wajah Mahasiswa</span>
              </h3>
              {faceUrl ? (
                <img
                  src={faceUrl}
                  alt="Wajah Mahasiswa"
                  className="h-56 mx-auto object-contain rounded-xl border border-slate-200 bg-slate-900"
                  style={{ transform: 'none' }}
                />
              ) : (
                <div className="h-56 flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-xl">
                  Foto wajah belum diunggah
                </div>
              )}
              <span className="text-[10px] text-slate-400 mt-2 block">
                Disimpan sebagai foto referensi verifikasi
              </span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
              <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-center gap-1.5">
                <ShieldCheck size={13} className="text-emerald-600" />
                <span>Foto Kartu Identitas ({docType})</span>
              </h3>
              {docUrl ? (
                <img
                  src={docUrl}
                  alt={`Kartu Identitas ${docType}`}
                  className="h-56 mx-auto object-contain rounded-xl border border-slate-200 bg-slate-900"
                  style={{ transform: 'none' }}
                />
              ) : (
                <div className="h-56 flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-xl">
                  Foto dokumen belum diunggah
                </div>
              )}
              <span className="text-[10px] text-red-500 font-medium mt-2 block">
                Dihapus permanen dari storage setelah keputusan dibuat
              </span>
            </div>
          </div>

          {/* 3 Centang Pemeriksaan Manual (FR-01B & PRD Revisi 3 Bagian 3) */}
          <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
              <span>Pemeriksaan Manual oleh Petugas:</span>
            </h4>
            <div className="space-y-2.5 text-xs">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={faceMatch}
                  onChange={(e) => setFaceMatch(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-800 leading-relaxed">
                  <strong>1. Kesesuaian Wajah:</strong> Wajah mahasiswa pada foto sesuai secara visual dengan foto yang tercantum pada kartu identitas ({docType}).
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={nameMatch}
                  onChange={(e) => setNameMatch(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-800 leading-relaxed">
                  <strong>2. Kesesuaian Nama:</strong> Nama pada kartu identitas sesuai dengan nama lengkap yang didaftarkan ({studentName}).
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={statusConfirmed}
                  onChange={(e) => setStatusConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-800 leading-relaxed">
                  <strong>3. Konfirmasi Status & Kelas:</strong> Informasi mahasiswa dan kelas sesuai, serta kelayakan mahasiswa sebagai ketua kelas terkonfirmasi.
                </span>
              </label>
            </div>
          </div>

          {/* Input Catatan / Alasan Penolakan atau Permintaan Perbaikan */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Catatan / Alasan Petugas (Wajib diisi jika Ditolak atau Diminta Pengambilan Ulang):
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tuliskan catatan alasan penolakan atau instruksi perbaikan kepada mahasiswa..."
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Tombol Aksi Keputusan Admin */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep('CAPTURE')}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
            >
              <Camera size={13} />
              <span>Buka Kamera Meja TU</span>
            </button>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
              {/* C. Request Resubmission */}
              <button
                type="button"
                onClick={() => handleDecision('REQUEST_RESUBMISSION')}
                disabled={submitting}
                className="px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw size={13} />
                <span>Minta Pengambilan Ulang</span>
              </button>

              {/* B. Reject */}
              <button
                type="button"
                onClick={() => handleDecision('REJECT')}
                disabled={submitting}
                className="px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <XCircle size={13} />
                <span>Tolak Akun</span>
              </button>

              {/* A. Approve */}
              <button
                type="button"
                onClick={() => handleDecision('APPROVE')}
                disabled={!faceMatch || !nameMatch || !statusConfirmed || submitting}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 size={14} />
                <span>{submitting ? 'Menyetujui...' : '✓ Setujui Akun (ACTIVE)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
