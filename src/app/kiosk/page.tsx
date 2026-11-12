'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import QrScannerBox, { type QrScannerBoxHandle } from '@/components/kiosk/QrScannerBox';
import {
  canSubmitKioskTransaction,
  executeDirectReturnTransition,
  executeManualLookupSession,
  executeProjectorQrScan,
  executeStudentQrScan,
  formatKioskDueAt,
  type KioskManualSearchStudent,
  type KioskProjectorInfo,
  type KioskStudentInfo,
  type KioskTransactionSuccess,
} from '@/lib/kiosk-workflow';

interface KioskTransactionPayload {
  idempotency_key: string;
  projector_code: string;
  photo_base64: string;
  condition: 'NORMAL' | 'ISSUE';
  issue_notes?: string;
  kiosk_session_id?: string | null;
  returner?: {
    type: 'BORROWER' | 'REPRESENTATIVE';
    name?: string;
  };
}

export default function KioskPage() {
  // Step State: 1 = Scan/Lookup Student, 2 = Scan Unit, 3 = Photo Documentation, 4 = Confirmation & Result
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Session Data
  const [kioskSessionId, setKioskSessionId] = useState<string | null>(null);
  const [student, setStudent] = useState<KioskStudentInfo | null>(null);
  const [projector, setProjector] = useState<KioskProjectorInfo | null>(null);
  const [isDirectReturnMode, setIsDirectReturnMode] = useState(false);

  // Return Flow State
  const [returnerType, setReturnerType] = useState<'BORROWER' | 'REPRESENTATIVE'>('BORROWER');
  const [representativeName, setRepresentativeName] = useState('');
  const [representativeConfirmed, setRepresentativeConfirmed] = useState(false);
  const [returnerMismatchWarning, setReturnerMismatchWarning] = useState<string | null>(null);

  // Scanner & Input State
  const [scannerInput, setScannerInput] = useState('');
  const [scanningLoading, setScanningLoading] = useState(false);
  const [isCameraTransitioning, setIsCameraTransitioning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const qrScannerRef = useRef<QrScannerBoxHandle | null>(null);

  // Manual Lookup Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KioskManualSearchStudent[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [manualReason, setManualReason] = useState('');

  // Webcam & Photo Capture State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePhotoStreamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Condition & Notes
  const [conditionNotes, setConditionNotes] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionSuccess, setTransactionSuccess] = useState<KioskTransactionSuccess | null>(null);

  // 30s Inactivity Auto-Reset
  const [inactivityTimer, setInactivityTimer] = useState<number>(30);
  const lastActivityRef = useRef<number>(Date.now());

  const stopPhotoStream = useCallback(() => {
    if (activePhotoStreamRef.current) {
      activePhotoStreamRef.current.getTracks().forEach((track) => track.stop());
      activePhotoStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const stopQrScannerSafely = useCallback(async () => {
    setIsCameraTransitioning(true);
    await qrScannerRef.current?.stop();
  }, []);

  const resetKiosk = useCallback(async () => {
    stopPhotoStream();
    try {
      await stopQrScannerSafely();
      setCurrentStep(1);
      setKioskSessionId(null);
      setStudent(null);
      setProjector(null);
      setIsDirectReturnMode(false);
      setReturnerType('BORROWER');
      setRepresentativeName('');
      setRepresentativeConfirmed(false);
      setReturnerMismatchWarning(null);
      setScannerInput('');
      setErrorMessage(null);
      setShowManualModal(false);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedStudentId(null);
      setManualReason('');
      setCapturedPhoto(null);
      setConditionNotes('');
      setShowIssueModal(false);
      setTransactionSuccess(null);
      lastActivityRef.current = Date.now();
      setInactivityTimer(30);
    } finally {
      setIsCameraTransitioning(false);
    }
  }, [stopPhotoStream, stopQrScannerSafely]);

  // Update activity timestamp on user interaction
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setInactivityTimer(30);
  }, []);

  // Inactivity countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, 30 - elapsedSeconds);
      setInactivityTimer(remaining);

      // Reset otomatis jika sudah tidak aktif 30 detik (kecuali saat Step 1 kosong tanpa sesi)
      if (remaining === 0 && (kioskSessionId || isDirectReturnMode || projector || capturedPhoto)) {
        void resetKiosk();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [kioskSessionId, isDirectReturnMode, projector, capturedPhoto, resetKiosk]);

  // Setup / Stop Webcam stream when reaching Step 3 (hanya setelah scanner QR berhenti tuntas)
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    if (
      currentStep !== 3 ||
      capturedPhoto ||
      isCameraTransitioning ||
      showIssueModal ||
      showManualModal
    ) {
      stopPhotoStream();
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setCameraError(
        'Kamera webcam tidak didukung pada konteks ini (wajib HTTPS atau localhost).'
      );
      setCameraActive(false);
      return;
    }

    setCameraError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = s;
        activePhotoStreamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
          setCameraActive(true);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error && err.message ? err.message : 'Izin ditolak';
        setCameraError(
          `Kamera webcam tidak dapat diakses (${msg}). Pastikan perangkat memiliki izin kamera.`
        );
        setCameraActive(false);
      });

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      stopPhotoStream();
    };
  }, [
    currentStep,
    capturedPhoto,
    isCameraTransitioning,
    showIssueModal,
    showManualModal,
    stopPhotoStream,
  ]);

  // Handler: Open Manual Lookup Modal (FR-16) — hentikan scanner terlebih dahulu
  const handleOpenManualModal = async () => {
    recordActivity();
    try {
      await stopQrScannerSafely();
      setShowManualModal(true);
    } finally {
      setIsCameraTransitioning(false);
    }
  };

  // Handler: Direct Return Mode (FR-07 tanpa QR Pass mahasiswa)
  const handleEnterDirectReturn = async () => {
    recordActivity();
    setScanningLoading(true);
    setErrorMessage(null);
    try {
      const transition = await executeDirectReturnTransition({
        stopScanner: stopQrScannerSafely,
      });
      setKioskSessionId(null);
      setStudent(null);
      setProjector(null);
      setScannerInput('');
      setIsDirectReturnMode(transition.isDirectReturnMode);
      setReturnerType(transition.defaultReturnerType);
      setRepresentativeName('');
      setRepresentativeConfirmed(false);
      setReturnerMismatchWarning(null);
      setCurrentStep(transition.nextStep);
    } finally {
      setIsCameraTransitioning(false);
      setScanningLoading(false);
    }
  };

  // Handler: Scan Student Token (Webcam QR Scanner maupun Input Manual / USB Scanner)
  const handleStudentScan = async (token: string) => {
    recordActivity();
    setScanningLoading(true);
    setErrorMessage(null);
    try {
      const result = await executeStudentQrScan({
        token,
        stopScanner: stopQrScannerSafely,
      });

      if (!result.ok) {
        setErrorMessage(result.errorMessage);
        return;
      }

      setIsDirectReturnMode(false);
      setReturnerMismatchWarning(null);
      setRepresentativeConfirmed(false);
      setKioskSessionId(result.kioskSessionId);
      setStudent(result.student);
      setScannerInput('');
      setCurrentStep(result.nextStep);
    } finally {
      setIsCameraTransitioning(false);
      setScanningLoading(false);
    }
  };

  // Handler: Execute Manual Lookup (FR-16)
  const handleManualLookupSubmit = async () => {
    recordActivity();
    setScanningLoading(true);
    setErrorMessage(null);
    try {
      const result = await executeManualLookupSession({
        studentId: selectedStudentId,
        reason: manualReason,
        stopScanner: stopQrScannerSafely,
      });

      if (!result.ok) {
        setErrorMessage(result.errorMessage);
        return;
      }

      setIsDirectReturnMode(false);
      setReturnerMismatchWarning(null);
      setRepresentativeConfirmed(false);
      setKioskSessionId(result.kioskSessionId);
      setStudent(result.student);
      setShowManualModal(false);
      setScannerInput('');
      setCurrentStep(result.nextStep);
    } finally {
      setIsCameraTransitioning(false);
      setScanningLoading(false);
    }
  };

  // Handler: Search Students for Manual Modal
  const handleSearchStudents = async () => {
    if (!searchQuery || searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await fetch('/api/kiosk/students/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: searchQuery.trim() }),
      });
      const json = (await res.json()) as { data?: KioskManualSearchStudent[] };
      if (res.ok) {
        setSearchResults(json.data || []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Handler: Scan Projector Unit (Webcam QR Scanner maupun Input Manual / USB Scanner)
  const handleProjectorScan = async (code: string) => {
    recordActivity();
    setScanningLoading(true);
    setErrorMessage(null);
    try {
      const result = await executeProjectorQrScan({
        code,
        isDirectReturnMode,
        scannedStudent: student ? { id: student.id, name: student.name } : null,
        stopScanner: stopQrScannerSafely,
      });

      if (!result.ok) {
        setErrorMessage(result.errorMessage);
        return;
      }

      setProjector(result.projector);
      setScannerInput('');

      if (result.returnerContext) {
        setReturnerType(result.returnerContext.defaultReturnerType);
        setRepresentativeName(result.returnerContext.prefilledRepresentativeName);
        setReturnerMismatchWarning(result.returnerContext.mismatchWarning);
        setRepresentativeConfirmed(false);
      } else {
        setReturnerType('BORROWER');
        setRepresentativeName('');
        setReturnerMismatchWarning(null);
        setRepresentativeConfirmed(false);
      }

      setCurrentStep(result.nextStep);
    } finally {
      setIsCameraTransitioning(false);
      setScanningLoading(false);
    }
  };

  // Trigger Snapshot with 3s Countdown
  const triggerCountdownSnapshot = () => {
    recordActivity();
    let sec = 3;
    setCountdown(sec);

    const interval = setInterval(() => {
      sec -= 1;
      if (sec <= 0) {
        clearInterval(interval);
        setCountdown(null);
        captureWebcamFrame();
      } else {
        setCountdown(sec);
      }
    }, 1000);
  };

  // Capture frame from video to canvas & compress to base64
  const captureWebcamFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, 640, 480);
    // Kompresi JPEG kualitas 0.7 (target <= 250 KB)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    setCapturedPhoto(dataUrl);
  };

  // Submit Final Transaction (BORROW / RETURN)
  const handleFinalTransaction = async (condition: 'NORMAL' | 'ISSUE') => {
    if (
      !projector ||
      !capturedPhoto ||
      !canSubmitKioskTransaction({
        projectorStatus: projector.status,
        capturedPhoto,
        isSubmitting,
        returnerType,
        representativeName,
        representativeConfirmed,
      })
    ) {
      return;
    }
    recordActivity();
    setIsSubmitting(true);
    setErrorMessage(null);

    // Buat idempotency key unik untuk request ini
    const idempotencyKey = crypto.randomUUID();

    try {
      const payload: KioskTransactionPayload = {
        idempotency_key: idempotencyKey,
        projector_code: projector.code,
        photo_base64: capturedPhoto,
        condition,
        issue_notes: condition === 'ISSUE' ? conditionNotes : undefined,
      };

      if (projector.status === 'AVAILABLE') {
        payload.kiosk_session_id = kioskSessionId;
      } else if (projector.status === 'BORROWED') {
        payload.returner = {
          type: returnerType,
          name: returnerType === 'REPRESENTATIVE' ? representativeName.trim() : undefined,
        };
      }

      const res = await fetch('/api/kiosk/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as {
        data?: KioskTransactionSuccess;
        error?: { message?: string };
      };

      if (!res.ok || !json.data) {
        setErrorMessage(json.error?.message || 'Transaksi gagal diproses oleh server.');
      } else {
        setTransactionSuccess(json.data);
        setCurrentStep(4); // Pindah ke Layar Sukses
      }
    } catch {
      setErrorMessage('Terjadi gangguan jaringan saat memproses transaksi di server.');
    } finally {
      setIsSubmitting(false);
      setShowIssueModal(false);
    }
  };

  const isBorrow = projector?.status === 'AVAILABLE';
  const canConfirmTransaction = canSubmitKioskTransaction({
    projectorStatus: projector?.status,
    capturedPhoto,
    isSubmitting,
    returnerType,
    representativeName,
    representativeConfirmed,
  });

  return (
    <div
      onMouseMove={recordActivity}
      onClick={recordActivity}
      onKeyDown={recordActivity}
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 md:p-8 select-none"
    >
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Header Bar */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
            SP
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Kiosk Transaksi Dual-Scan
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Standby Loket TU
              </span>
            </h1>
            <p className="text-xs text-slate-400">PINJAM • Peminjaman & Pengembalian Cepat</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="text-xs text-slate-400 font-mono">Reset otomatis dalam:</span>
            <span className="ml-1 text-xs font-mono font-bold text-amber-400">{inactivityTimer}s</span>
          </div>

          <button
            type="button"
            onClick={() => void resetKiosk()}
            className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Reset Sesi
          </button>

          <Link
            href="/admin"
            className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            Panel Admin
          </Link>
        </div>
      </div>

      {/* Main Kiosk Work Area */}
      <div className="max-w-6xl w-full mx-auto my-6 flex-1 flex flex-col justify-center">
        {/* Step Progress Tracker */}
        <div className="grid grid-cols-4 gap-2 mb-6 text-xs font-semibold">
          <div
            className={`p-3 rounded-2xl border text-center transition-all ${
              currentStep === 1
                ? 'bg-blue-600/20 border-blue-500 text-blue-400 ring-2 ring-blue-500/30'
                : student || isDirectReturnMode
                ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-400'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
          >
            1. {isDirectReturnMode ? 'Pengembalian Langsung' : 'Ketua Kelas'}{' '}
            {(student || isDirectReturnMode) && '✓'}
          </div>
          <div
            className={`p-3 rounded-2xl border text-center transition-all ${
              currentStep === 2
                ? 'bg-blue-600/20 border-blue-500 text-blue-400 ring-2 ring-blue-500/30'
                : projector
                ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-400'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
          >
            2. Unit Proyektor {projector && '✓'}
          </div>
          <div
            className={`p-3 rounded-2xl border text-center transition-all ${
              currentStep === 3
                ? 'bg-blue-600/20 border-blue-500 text-blue-400 ring-2 ring-blue-500/30'
                : capturedPhoto
                ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-400'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
          >
            3. Foto Dokumentasi {capturedPhoto && '✓'}
          </div>
          <div
            className={`p-3 rounded-2xl border text-center transition-all ${
              currentStep === 4
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/30'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
          >
            4. Konfirmasi & Simpan
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-red-950/60 border border-red-500/50 text-red-200 text-sm flex items-start gap-3 shadow-lg">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <p className="font-bold">Kendala Pemindaian</p>
              <p className="mt-0.5 text-xs text-red-300">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs text-red-400 hover:text-white px-2 py-1 rounded"
            >
              Tutup
            </button>
          </div>
        )}

        {/* STEP 1: Scan Student QR or Manual Lookup / Direct Return */}
        {currentStep === 1 && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-2xl mx-auto w-full text-center space-y-5 shadow-2xl">
            <div className="space-y-1.5">
              <span className="inline-block px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold">
                Langkah 1 dari 4
              </span>
              <h2 className="text-2xl font-bold text-white tracking-tight">Pindai QR Pass Mahasiswa</h2>
              <p className="text-sm text-slate-400">
                Arahkan layar ponsel ketua kelas yang menampilkan QR Pass ke kamera webcam atau scanner USB TU.
              </p>
            </div>

            {/* Webcam QR Scanner (FR-03) */}
            <QrScannerBox
              key="kiosk-step1-student-scanner"
              mode="STUDENT_QR"
              active={currentStep === 1 && !showManualModal && !isCameraTransitioning}
              scannerRef={qrScannerRef}
              onScan={(token) => void handleStudentScan(token)}
            />

            {/* Jalur Pengembalian Langsung oleh Perwakilan (FR-07) */}
            <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
              <div>
                <p className="text-xs font-bold text-amber-300">Pengembalian oleh Perwakilan (Tanpa QR Pass)</p>
                <p className="text-[11px] text-amber-200/80">
                  Pilih jalur ini jika unit dikembalikan oleh teman/perwakilan tanpa ketua kelas hadir.
                </p>
              </div>
              <button
                type="button"
                disabled={scanningLoading || isCameraTransitioning}
                onClick={() => void handleEnterDirectReturn()}
                className="w-full sm:w-auto shrink-0 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-colors disabled:opacity-50"
              >
                Pengembalian Langsung (Perwakilan)
              </button>
            </div>

            {/* Input Manual / USB Barcode Scanner Fallback */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80 text-left">
              <label htmlFor="kiosk-student-token-input" className="block text-[11px] font-semibold text-slate-400">
                Input Manual / Scanner Barcode USB:
              </label>
              <div className="relative">
                <input
                  id="kiosk-student-token-input"
                  type="text"
                  autoFocus
                  value={scannerInput}
                  onChange={(e) => setScannerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && scannerInput.trim()) {
                      void handleStudentScan(scannerInput.trim());
                    }
                  }}
                  placeholder="Tempelkan atau ketik token QR Pass di sini lalu Enter..."
                  className="w-full px-4 py-3.5 bg-slate-950 border border-slate-700 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  disabled={scanningLoading || isCameraTransitioning}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={scanningLoading || isCameraTransitioning || !scannerInput.trim()}
                  onClick={() => void handleStudentScan(scannerInput.trim())}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
                >
                  {scanningLoading ? 'Memverifikasi Token...' : 'Verifikasi QR'}
                </button>
                <button
                  type="button"
                  disabled={scanningLoading || isCameraTransitioning}
                  onClick={() => void handleOpenManualModal()}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
                >
                  Pencarian Manual (FR-16)
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-center gap-2">
              <span>🔒</span>
              <span>Token bertanda tangan kriptografis server (HS256) berumur 60 detik.</span>
            </div>
          </div>
        )}

        {/* STEP 2: Scan Projector Unit */}
        {currentStep === 2 && (student || isDirectReturnMode) && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-2xl mx-auto w-full space-y-5 shadow-2xl">
            {/* Context Badge Card: Student Verified OR Direct Return */}
            {student ? (
              <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-500/30 flex items-center gap-4">
                {student.profile_photo_signed_url ? (
                  <img
                    src={student.profile_photo_signed_url}
                    alt={student.name}
                    className="h-14 w-14 rounded-xl object-cover border border-blue-400"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-xl bg-blue-900 flex items-center justify-center text-lg font-bold">
                    {student.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                      Ketua Terverifikasi
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">Metode: {student.identification_method}</span>
                  </div>
                  <h3 className="text-base font-bold text-white truncate mt-0.5">{student.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    NIM: {student.nim} • {student.class_name}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                    Mode Pengembalian Langsung (Perwakilan)
                  </span>
                  <p className="text-xs text-amber-100 mt-1.5 leading-relaxed">
                    QR Pass mahasiswa dilewati. Pindai kode QR unit proyektor yang berstatus <strong>BORROWED</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={scanningLoading || isCameraTransitioning}
                  onClick={() => void resetKiosk()}
                  className="shrink-0 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
                >
                  Kembali ke Pindai QR Pass
                </button>
              </div>
            )}

            <div className="text-center space-y-1">
              <span className="inline-block px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold">
                Langkah 2 dari 4
              </span>
              <h2 className="text-2xl font-bold text-white tracking-tight">Pindai QR Unit Proyektor</h2>
              <p className="text-sm text-slate-400">
                Pindai stiker kode QR pada fisik unit proyektor (misal: PROJ-001) lewat kamera webcam atau input teks.
              </p>
            </div>

            {/* Webcam QR Scanner untuk Unit Proyektor */}
            <QrScannerBox
              key="kiosk-step2-projector-scanner"
              mode="PROJECTOR_QR"
              active={currentStep === 2 && !isCameraTransitioning}
              scannerRef={qrScannerRef}
              onScan={(code) => void handleProjectorScan(code)}
            />

            {/* Input Manual / USB Barcode Scanner Fallback */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <label htmlFor="kiosk-projector-code-input" className="block text-[11px] font-semibold text-slate-400">
                Input Manual / Scanner Barcode USB:
              </label>
              <input
                id="kiosk-projector-code-input"
                type="text"
                autoFocus
                value={scannerInput}
                onChange={(e) => setScannerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && scannerInput.trim()) {
                    void handleProjectorScan(scannerInput.trim());
                  }
                }}
                placeholder="Ketik atau scan kode proyektor (mis. PROJ-001) lalu Enter..."
                className="w-full px-4 py-3.5 bg-slate-950 border border-slate-700 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 uppercase font-mono tracking-wider"
                disabled={scanningLoading || isCameraTransitioning}
              />

              <button
                type="button"
                disabled={scanningLoading || isCameraTransitioning || !scannerInput.trim()}
                onClick={() => void handleProjectorScan(scannerInput.trim())}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
              >
                {scanningLoading ? 'Mengecek Status Unit...' : 'Periksa Proyektor'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Webcam Documentation & Returner Selection */}
        {currentStep === 3 && projector && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-3xl mx-auto w-full space-y-6 shadow-2xl">
            {/* Context Summary Header */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Unit Info Card */}
              <div
                className={`p-4 rounded-2xl border ${
                  isBorrow ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-amber-950/30 border-amber-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {projector.code}
                  </span>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      isBorrow
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {isBorrow ? 'ALUR PEMINJAMAN (AVAILABLE)' : 'ALUR PENGEMBALIAN (BORROWED)'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">{projector.name}</h3>

                {!isBorrow && projector.active_loan && (
                  <div className="mt-2 text-xs text-slate-300 space-y-0.5 border-t border-slate-800/60 pt-2">
                    <p>
                      Peminjam: <strong className="text-white">{projector.active_loan.student_name}</strong>
                    </p>
                    <p className="font-mono text-[11px] text-slate-400">
                      Batas Waktu: {formatKioskDueAt(projector.active_loan.due_at)}
                    </p>
                    {projector.active_loan.is_overdue && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">
                        TERLAMBAT DIKEMBALIKAN
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Borrower Info Card */}
              {isBorrow && student && (
                <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-500/30 flex items-center gap-3">
                  {student.profile_photo_signed_url && (
                    <img
                      src={student.profile_photo_signed_url}
                      alt={student.name}
                      className="h-12 w-12 rounded-xl object-cover border border-blue-400"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-semibold text-blue-400">Peminjam Terdaftar:</span>
                    <h4 className="text-sm font-bold text-white truncate">{student.name}</h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {student.nim} • {student.class_name}
                    </p>
                  </div>
                </div>
              )}

              {/* Returner Form for Return Flow */}
              {!isBorrow && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-300">Pengembali Unit:</label>

                  {returnerMismatchWarning && (
                    <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/50 text-[11px] text-amber-200 leading-relaxed space-y-1">
                      <p className="font-bold text-amber-300">⚠️ Pemindai Berbeda dari Peminjam Aktif</p>
                      <p>{returnerMismatchWarning}</p>
                      {student && projector.active_loan && (
                        <p className="font-mono text-[10px] text-amber-100/90">
                          Peminjam aktif: {projector.active_loan.student_name} ({projector.active_loan.student_nim}) •
                          Dipindai: {student.name} ({student.nim})
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isDirectReturnMode}
                      onClick={() => {
                        setReturnerType('BORROWER');
                        setRepresentativeConfirmed(false);
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        returnerType === 'BORROWER'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Peminjam Sendiri
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReturnerType('REPRESENTATIVE');
                        setRepresentativeConfirmed(false);
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-colors ${
                        returnerType === 'REPRESENTATIVE'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Perwakilan (Teman)
                    </button>
                  </div>

                  {isDirectReturnMode && (
                    <p className="text-[11px] text-amber-300/90">
                      Jalur Pengembalian Langsung tanpa QR Pass mewajibkan pencatatan identitas Perwakilan.
                    </p>
                  )}

                  {returnerType === 'REPRESENTATIVE' && (
                    <div className="pt-1 space-y-2">
                      <input
                        type="text"
                        value={representativeName}
                        onChange={(e) => setRepresentativeName(e.target.value)}
                        placeholder="Ketik nama lengkap perwakilan..."
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                      <label className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={representativeConfirmed}
                          onChange={(e) => setRepresentativeConfirmed(e.target.checked)}
                          className="mt-0.5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
                        />
                        <span>
                          Petugas telah memeriksa identitas pengembali dan mengonfirmasi nama perwakilan di atas.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Webcam Live Capture Frame */}
            <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-slate-800 max-w-lg mx-auto aspect-video flex items-center justify-center shadow-inner">
              {!capturedPhoto ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

                  {/* 3s Countdown Overlay */}
                  {countdown !== null && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <span className="text-7xl font-extrabold text-white animate-ping">{countdown}</span>
                    </div>
                  )}

                  {!cameraActive && (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      {cameraError || 'Menginisialisasi kamera webcam...'}
                    </div>
                  )}
                </>
              ) : (
                <div className="relative w-full h-full">
                  <img src={capturedPhoto} alt="Snapshot Dokumentasi" className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold">
                    Foto Tersimpan
                  </div>
                </div>
              )}
            </div>

            {/* Camera Controls */}
            <div className="flex justify-center gap-3">
              {!capturedPhoto ? (
                <button
                  type="button"
                  disabled={!cameraActive || countdown !== null}
                  onClick={triggerCountdownSnapshot}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <span>📷</span>
                  <span>Ambil Foto Dokumentasi (Hitung Mundur 3s)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCapturedPhoto(null)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
                >
                  Foto Ulang
                </button>
              )}
            </div>

            {/* Step 4: Two Equal-Weight Big Confirmation Buttons (PRD Section 6) */}
            {capturedPhoto && (
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <p className="text-center text-xs font-semibold text-slate-300">
                  Periksa kondisi fisik unit proyektor, lalu tentukan konfirmasi transaksi:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Normal Button */}
                  <button
                    type="button"
                    disabled={!canConfirmTransaction}
                    onClick={() => void handleFinalTransaction('NORMAL')}
                    className="p-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-left font-bold text-base shadow-xl shadow-emerald-900/30 border border-emerald-400/40 transition-all disabled:opacity-50 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-lg">
                        <span>✓</span>
                        <span>Kondisi Terlihat Normal</span>
                      </div>
                      <p className="text-xs text-emerald-100 font-normal mt-1 leading-relaxed">
                        {isBorrow
                          ? 'Menerima unit proyektor dalam keadaan normal dan siap digunakan.'
                          : 'Mengembalikan unit proyektor dalam keadaan baik dan lengkap.'}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono mt-3 opacity-90">
                      {isBorrow ? 'Status Unit: BORROWED' : 'Status Unit: AVAILABLE'}
                    </span>
                  </button>

                  {/* Report Issue Button */}
                  <button
                    type="button"
                    disabled={!canConfirmTransaction}
                    onClick={() => setShowIssueModal(true)}
                    className="p-5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white text-left font-bold text-base shadow-xl shadow-amber-900/30 border border-amber-400/40 transition-all disabled:opacity-50 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-lg">
                        <span>⚠️</span>
                        <span>Laporkan Kendala</span>
                      </div>
                      <p className="text-xs text-amber-100 font-normal mt-1 leading-relaxed">
                        {isBorrow
                          ? 'Ditemukan kendala fisik/fungsi saat mengambil. Peminjaman dibatalkan.'
                          : 'Ditemukan kerusakan/kendala saat mengembalikan. Transaksi ditutup untuk perbaikan.'}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono mt-3 opacity-90">Status Unit: MAINTENANCE</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Success Screen */}
        {currentStep === 4 && transactionSuccess && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-xl mx-auto w-full text-center space-y-6 shadow-2xl animate-fade-in">
            <div className="h-16 w-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto text-3xl">
              ✓
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-white tracking-tight">Transaksi Berhasil Dicatat!</h2>
              <p className="text-sm text-slate-400">{transactionSuccess.message}</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left text-xs space-y-2">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Jenis Aksi:</span>
                <span className="font-bold text-white">{transactionSuccess.action}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Kode Unit:</span>
                <span className="font-mono font-bold text-white">{transactionSuccess.projector_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status Terkini Unit:</span>
                <span className="font-bold text-emerald-400">{transactionSuccess.status}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void resetKiosk()}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/20 transition-all"
            >
              Selesai & Sesi Baru
            </button>
          </div>
        )}
      </div>

      {/* Manual Lookup Modal (FR-16) */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Pencarian Manual Ketua Kelas (FR-16)</h3>
              <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Jalur cadangan resmi apabila ponsel ketua kelas kehabisan daya atau bermasalah saat memindai QR Pass.
            </p>

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchStudents()}
                  placeholder="Ketik NIM atau Nama Ketua Kelas..."
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSearchStudents}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl"
                >
                  {searching ? 'Mencari...' : 'Cari'}
                </button>
              </div>

              {/* Search Results */}
              <div className="max-h-48 overflow-y-auto space-y-2">
                {searchResults.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedStudentId(s.id)}
                    className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${
                      selectedStudentId === s.id
                        ? 'bg-blue-950/60 border-blue-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {s.profile_photo_signed_url && (
                      <img
                        src={s.profile_photo_signed_url}
                        alt={s.name}
                        className="h-10 w-10 rounded-lg object-cover border border-blue-400"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs truncate">{s.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {s.nim} • {s.class_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mandatory Reason Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Alasan Identifikasi Manual (Wajib):
                </label>
                <input
                  type="text"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="Contoh: HP ketua kehabisan baterai / layar retak..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!selectedStudentId || !manualReason.trim()}
                onClick={handleManualLookupSubmit}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Gunakan Pilihan Ini
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Issue Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="text-amber-400">⚠️</span>
              <span>Laporan Kendala Proyektor</span>
            </h3>

            <p className="text-xs text-slate-400 leading-relaxed">
              Unit proyektor akan dialihkan ke status <strong>MAINTENANCE</strong> untuk pemeriksaan teknis oleh petugas TU.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Catatan Rincian Kendala:
              </label>
              <textarea
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                placeholder="Contoh: Port HDMI longgar, lampu redup, kipas berisik..."
                rows={3}
                className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowIssueModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleFinalTransaction('ISSUE')}
                className="flex-1 py-2 rounded-xl bg-amber-600 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Menyimpan...' : 'Kirim Laporan Kendala'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Footer Information */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-900 pt-3">
        <span>Sistem Transaksi Proyektor PINJAM • TU Fakultas</span>
        <span className="font-mono">WIB (Asia/Jakarta) • Server Time Authoritative</span>
      </div>
    </div>
  );
}
