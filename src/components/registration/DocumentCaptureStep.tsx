'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RotateCcw, Check, RefreshCw, AlertCircle, CreditCard } from 'lucide-react';
import { compressCanvasToDataUrl, calculateTargetDimensions } from '@/lib/image';

interface DocumentCaptureStepProps {
  initialPhotoUrl?: string | null;
  initialDocType?: 'KTM' | 'KTP';
  onPhotoAccepted: (photoDataUrl: string, docType: 'KTM' | 'KTP') => void;
  onBack: () => void;
}

export default function DocumentCaptureStep({
  initialPhotoUrl,
  initialDocType = 'KTM',
  onPhotoAccepted,
  onBack,
}: DocumentCaptureStepProps) {
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(initialPhotoUrl || null);
  const [documentType, setDocumentType] = useState<'KTM' | 'KTP'>(initialDocType);
  const [isReviewing, setIsReviewing] = useState<boolean>(Boolean(initialPhotoUrl));
  // Default kamera belakang untuk memotret dokumen di atas meja
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isCapturingRef = useRef(false);
  const cameraSessionIdRef = useRef(0);

  const stopCamera = useCallback(() => {
    cameraSessionIdRef.current++;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    const sessionId = cameraSessionIdRef.current;

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: facingMode,
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Pastikan sesi kamera masih valid
      if (cameraSessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setCameraActive(true);
    } catch {
      // Fallback jika environment camera tidak ada (misal webcam laptop)
      if (facingMode === 'environment') {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: false,
          });

          if (cameraSessionIdRef.current !== sessionId) {
            fallbackStream.getTracks().forEach((track) => track.stop());
            return;
          }

          streamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            await videoRef.current.play().catch(() => {});
          }
          setFacingMode('user');
          setCameraActive(true);
          return;
        } catch {
          // Tetap error
        }
      }

      setCameraError(
        'Tidak dapat mengakses kamera perangkat. Harap izinkan akses kamera untuk memotret kartu identitas secara langsung.'
      );
      setCameraActive(false);
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (!isReviewing) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isReviewing, startCamera, stopCamera]);

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const capturePhoto = async () => {
    if (!videoRef.current || isCapturingRef.current) return;
    isCapturingRef.current = true;

    try {
      const video = videoRef.current;
      const originalW = video.videoWidth || 1280;
      const originalH = video.videoHeight || 720;

      const canvas = document.createElement('canvas');
      const { width, height } = calculateTargetDimensions(originalW, originalH, 1280);
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // PENTING: DILARANG mirror / flip horizontal (scaleX(-1) dilarang keras)
      ctx.drawImage(video, 0, 0, width, height);

      // Kompresi sisi klien target <= 250 KB
      const { dataUrl } = await compressCanvasToDataUrl(canvas, {
        maxDimension: 1280,
        initialQuality: 0.85,
        targetMaxBytes: 250 * 1024,
      });

      setPhotoDataUrl(dataUrl);
      setIsReviewing(true);
      stopCamera();
    } finally {
      isCapturingRef.current = false;
    }
  };

  const handleRetake = () => {
    setPhotoDataUrl(null);
    setIsReviewing(false);
  };

  const handleConfirmPhoto = () => {
    if (photoDataUrl) {
      onPhotoAccepted(photoDataUrl, documentType);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="text-center">
        <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
          Tahap 3 dari 4
        </span>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
          Pengambilan Foto Kartu Identitas
        </h2>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Foto fisik KTM atau KTP Anda secara langsung. Seluruh bagian kartu harus berada di dalam batas panduan dan dapat terbaca jelas.
        </p>
      </div>

      {/* Pilihan Jenis Dokumen Identitas */}
      <div className="flex items-center justify-center gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-xs">
        <span className="font-semibold text-slate-700">Jenis Dokumen:</span>
        <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
          <input
            type="radio"
            name="documentType"
            value="KTM"
            checked={documentType === 'KTM'}
            onChange={() => setDocumentType('KTM')}
            className="text-blue-600 focus:ring-blue-500"
          />
          <span>KTM (Kartu Tanda Mahasiswa)</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
          <input
            type="radio"
            name="documentType"
            value="KTP"
            checked={documentType === 'KTP'}
            onChange={() => setDocumentType('KTP')}
            className="text-blue-600 focus:ring-blue-500"
          />
          <span>KTP (Perlakuan Setara)</span>
        </label>
      </div>

      {!isReviewing ? (
        <div className="space-y-4">
          {/* Kamera Viewport */}
          <div className="relative mx-auto max-w-md aspect-[4/3] bg-slate-950 rounded-3xl overflow-hidden border-2 border-slate-800 shadow-xl flex items-center justify-center">
            {/* Video Preview: DILARANG menggunakan scaleX(-1) */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
              style={{ transform: 'none' }}
            />

            {/* Error Overlay */}
            {cameraError && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center text-white z-20">
                <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
                <p className="text-xs text-slate-300 leading-relaxed mb-4">{cameraError}</p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold"
                >
                  Coba Akses Kamera Lagi
                </button>
              </div>
            )}

            {/* Panduan Visual Persegi Panjang Kartu Identitas (Rasio Standar ID-1 ~1.58:1) */}
            {cameraActive && !cameraError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10 p-4">
                <div className="w-[85%] aspect-[1.58/1] rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/20 flex flex-col items-center justify-between p-3">
                  <div className="w-full flex justify-between items-center text-[10px] text-emerald-300 font-semibold tracking-wider uppercase">
                    <span>{documentType}</span>
                    <CreditCard size={14} />
                  </div>
                  <div className="text-[11px] text-center font-medium text-emerald-200 bg-slate-900/70 px-2.5 py-1 rounded-full">
                    Posisikan seluruh kartu di dalam kotak
                  </div>
                  <div className="w-full text-right text-[10px] text-emerald-300 font-mono">
                    Pastikan nama jelas
                  </div>
                </div>

                <div className="mt-3 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium shadow-md">
                  Arahkan kamera agar kartu tidak miring dan tidak silau
                </div>
              </div>
            )}

            {/* Tombol Ganti Kamera */}
            {cameraActive && !cameraError && (
              <button
                type="button"
                onClick={toggleCameraFacing}
                title="Ganti Kamera Depan/Belakang"
                className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white border border-white/20 shadow-md backdrop-blur-sm transition-all"
              >
                <RefreshCw size={16} />
              </button>
            )}
          </div>

          {/* Kontrol Aksi */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onBack}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              ← Kembali ke Foto Wajah
            </button>

            <button
              type="button"
              disabled={!cameraActive || cameraError !== null}
              onClick={capturePhoto}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Camera size={16} />
              <span>Ambil Foto {documentType}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Pratinjau & Konfirmasi Foto Dokumen */
        <div className="space-y-4">
          <div className="relative mx-auto max-w-md aspect-[4/3] bg-slate-100 rounded-3xl overflow-hidden border-2 border-slate-200 shadow-md flex items-center justify-center">
            {photoDataUrl && (
              // Foto ditampilkan normal tanpa mirror
              <img
                src={photoDataUrl}
                alt={`Pratinjau Foto ${documentType}`}
                className="w-full h-full object-contain bg-slate-900"
                style={{ transform: 'none' }}
              />
            )}
            <div className="absolute bottom-3 left-3 right-3 bg-slate-900/80 backdrop-blur-md p-2 rounded-xl text-center text-white text-[11px]">
              Foto {documentType} Terpilih
            </div>
          </div>

          <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 space-y-1">
            <p className="font-semibold">Periksa kembali hasil foto kartu Anda:</p>
            <p className="text-[11px] text-blue-700 leading-relaxed">
              Pastikan nama dan foto pada kartu terlihat jelas dan tidak terpotong. Sesuai kebijakan privasi, foto kartu ini akan dihapus secara permanen dari server segera setelah proses pemeriksaan admin selesai.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleRetake}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCcw size={14} />
              <span>Ambil Ulang Foto</span>
            </button>

            <button
              type="button"
              onClick={handleConfirmPhoto}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm flex items-center justify-center gap-1.5 transition-colors"
            >
              <Check size={14} />
              <span>Gunakan Foto & Lanjut →</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
