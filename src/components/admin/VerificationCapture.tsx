'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { compressCanvasToDataUrl, calculateTargetDimensions } from '@/lib/image';

interface VerificationCaptureProps {
  studentId: string;
  studentName: string;
  studentNim: string;
  existingFacePath?: string | null;
  existingDocPath?: string | null;
  onDecisionSubmitted: () => void;
  onCancel: () => void;
}

export default function VerificationCapture({
  studentId,
  studentName,
  studentNim,
  onDecisionSubmitted,
  onCancel,
}: VerificationCaptureProps) {
  const [step, setStep] = useState<'CAPTURE' | 'INSPECT'>('CAPTURE');
  const [activeCaptureMode, setActiveCaptureMode] = useState<'FACE' | 'DOCUMENT'>('FACE');
  const [documentType, setDocumentType] = useState<'KTM' | 'KTP'>('KTM');

  const [faceDataUrl, setFaceDataUrl] = useState<string | null>(null);
  const [docDataUrl, setDocDataUrl] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // 3 Centang Pemeriksaan Manual (FR-01B)
  const [faceMatch, setFaceMatch] = useState(false);
  const [nameMatch, setNameMatch] = useState(false);
  const [statusConfirmed, setStatusConfirmed] = useState(false);
  const [notes, setNotes] = useState('');

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    ctx.drawImage(video, 0, 0, width, height);

    // Kompresi sisi klien target <= 250 KB (NFR-02)
    const { dataUrl } = await compressCanvasToDataUrl(canvas, {
      maxDimension: 1280,
      initialQuality: 0.85,
      targetMaxBytes: 250 * 1024,
    });

    if (activeCaptureMode === 'FACE') {
      setFaceDataUrl(dataUrl);
      setActiveCaptureMode('DOCUMENT');
    } else {
      setDocDataUrl(dataUrl);
    }
  };

  const handleUploadAndProceed = async () => {
    if (!faceDataUrl || !docDataUrl) {
      setErrorMessage('Kedua foto (wajah referensi dan dokumen KTM/KTP) wajib diambil.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/admin/verifications/${studentId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          face_photo_base64: faceDataUrl,
          document_photo_base64: docDataUrl,
          document_type: documentType,
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
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xl max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            Sesi Verifikasi Tatap Muka TU
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            {studentName} <span className="font-mono text-sm text-slate-500 font-normal">({studentNim})</span>
          </h2>
        </div>
        <button
          onClick={onCancel}
          className="text-xs text-slate-500 hover:text-slate-800 font-medium px-3 py-1.5 rounded-lg border border-slate-200"
        >
          Tutup
        </button>
      </div>

      {errorMessage && (
        <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {step === 'CAPTURE' ? (
        <div className="mt-6 space-y-6">
          <div className="flex gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setActiveCaptureMode('FACE')}
              className={`px-4 py-2 text-xs font-semibold rounded-xl ${
                activeCaptureMode === 'FACE' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              1. Foto Wajah Referensi {faceDataUrl ? '✓' : ''}
            </button>
            <button
              onClick={() => setActiveCaptureMode('DOCUMENT')}
              className={`px-4 py-2 text-xs font-semibold rounded-xl ${
                activeCaptureMode === 'DOCUMENT' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              2. Foto Dokumen ({documentType}) {docDataUrl ? '✓' : ''}
            </button>
          </div>

          {activeCaptureMode === 'DOCUMENT' && (
            <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700">Jenis Dokumen:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="docType"
                  value="KTM"
                  checked={documentType === 'KTM'}
                  onChange={() => setDocumentType('KTM')}
                />
                <span>KTM (Kartu Tanda Mahasiswa)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="docType"
                  value="KTP"
                  checked={documentType === 'KTP'}
                  onChange={() => setDocumentType('KTP')}
                />
                <span>KTP (Setara / Diterima Sama)</span>
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Viewport Kamera */}
            <div className="relative rounded-2xl bg-slate-900 overflow-hidden aspect-video flex items-center justify-center border border-slate-800">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
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

            {/* Pratinjau Foto */}
            <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50 flex flex-col items-center justify-center aspect-video relative">
              {activeCaptureMode === 'FACE' ? (
                faceDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={faceDataUrl} alt="Pratinjau Wajah" className="max-h-full object-contain rounded-xl" />
                ) : (
                  <span className="text-xs text-slate-400">Belum ada foto wajah referensi</span>
                )
              ) : docDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={docDataUrl} alt="Pratinjau Dokumen" className="max-h-full object-contain rounded-xl" />
              ) : (
                <span className="text-xs text-slate-400">Belum ada foto dokumen identitas</span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={capturePhoto}
              className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-sm"
            >
              📷 Ambil {activeCaptureMode === 'FACE' ? 'Foto Wajah' : 'Foto Dokumen'}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUploadAndProceed}
                disabled={!faceDataUrl || !docDataUrl || uploading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50"
              >
                {uploading ? 'Menyimpan Foto...' : 'Lanjut ke Pemeriksaan →'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Tahap 2: Inspeksi Visual Berdampingan & 3 Centang Pemeriksaan Manual (FR-01B) */
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
              <h3 className="text-xs font-bold text-slate-700 mb-2">Foto Wajah Referensi</h3>
              {faceDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={faceDataUrl} alt="Wajah" className="h-48 mx-auto object-contain rounded-xl border border-slate-200" />
              )}
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
              <h3 className="text-xs font-bold text-slate-700 mb-2">Foto Dokumen ({documentType})</h3>
              {docDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={docDataUrl} alt="Dokumen" className="h-48 mx-auto object-contain rounded-xl border border-slate-200" />
              )}
            </div>
          </div>

          {/* 3 Centang Pemeriksaan Manual */}
          <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">
              Tiga Centang Pemeriksaan Manual Petugas (FR-01B):
            </h4>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={faceMatch}
                  onChange={(e) => setFaceMatch(e.target.checked)}
                  className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-800">
                  <strong>(a) Kesesuaian Wajah:</strong> Wajah mahasiswa di depan meja sesuai secara visual dengan foto pada dokumen identitas.
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={nameMatch}
                  onChange={(e) => setNameMatch(e.target.checked)}
                  className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-800">
                  <strong>(b) Kesesuaian Nama:</strong> Nama pada dokumen identitas sesuai dengan nama registrasi akun ({studentName}).
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={statusConfirmed}
                  onChange={(e) => setStatusConfirmed(e.target.checked)}
                  className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-800">
                  <strong>(c) Konfirmasi Status:</strong> Status keaktifan mahasiswa dan ketua kelas telah dipastikan melalui cara yang ditentukan TU (KRS di HP / konfirmasi prodi).
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Catatan Petugas (Wajib diisi jika Ditolak atau Diminta Foto Ulang)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan alasan atau instruksi perbaikan kepada mahasiswa..."
              className="w-full rounded-xl border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep('CAPTURE')}
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              ← Foto Ulang
            </button>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleDecision('REQUEST_RESUBMISSION')}
                disabled={submitting}
                className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold text-xs rounded-xl"
              >
                Minta Pengambilan Ulang
              </button>

              <button
                type="button"
                onClick={() => handleDecision('REJECT')}
                disabled={submitting}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-semibold text-xs rounded-xl"
              >
                Tolak Akun
              </button>

              <button
                type="button"
                onClick={() => handleDecision('APPROVE')}
                disabled={!faceMatch || !nameMatch || !statusConfirmed || submitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50"
              >
                {submitting ? 'Memproses...' : '✓ Setujui Akun (ACTIVE)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
