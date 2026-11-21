'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RotateCcw, Check, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { detectFaceInVideo, type FaceFramingResult } from '@/lib/face-detection';
import { compressCanvasToDataUrl, calculateTargetDimensions } from '@/lib/image';

interface FaceCaptureStepProps {
  initialPhotoUrl?: string | null;
  onPhotoAccepted: (photoDataUrl: string) => void;
  onBack?: () => void;
}

export default function FaceCaptureStep({
  initialPhotoUrl,
  onPhotoAccepted,
  onBack,
}: FaceCaptureStepProps) {
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(initialPhotoUrl || null);
  const [isReviewing, setIsReviewing] = useState<boolean>(Boolean(initialPhotoUrl));
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [framingResult, setFramingResult] = useState<FaceFramingResult>({
    detected: false,
    isFramed: false,
    status: 'NO_FACE',
    message: 'Mempersiapkan kamera...',
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCapturingRef = useRef(false);
  const cameraSessionIdRef = useRef(0);

  const stopCamera = useCallback(() => {
    cameraSessionIdRef.current++;
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
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

      // Pastikan sesi kamera masih valid (tidak dibatalkan atau beralih saat getUserMedia berlangsung)
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

      // Loop deteksi posisi wajah tiap 250ms
      detectionIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2 || isCapturingRef.current) {
          return;
        }

        const v = videoRef.current;
        const vW = v.videoWidth || 640;
        const vH = v.videoHeight || 480;

        // Area panduan oval di tengah frame (55% tinggi, 42% lebar)
        const guideWidth = vW * 0.42;
        const guideHeight = vH * 0.58;
        const guide = {
          x: (vW - guideWidth) / 2,
          y: (vH - guideHeight) / 2,
          width: guideWidth,
          height: guideHeight,
        };

        const result = await detectFaceInVideo(v, guide);
        setFramingResult(result);
      }, 250);
    } catch {
      setCameraError(
        'Tidak dapat mengakses kamera perangkat. Harap izinkan akses kamera pada peramban Anda untuk mengambil foto langsung.'
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
      onPhotoAccepted(photoDataUrl);
    }
  };

  // Status visual overlay oval
  const getGuideBorderColor = () => {
    switch (framingResult.status) {
      case 'PERFECT':
        return 'border-emerald-500 shadow-emerald-500/50 ring-4 ring-emerald-400/40';
      case 'TOO_FAR':
      case 'TOO_CLOSE':
      case 'OFF_CENTER':
        return 'border-amber-400 shadow-amber-400/40 ring-2 ring-amber-300/30';
      case 'NO_FACE':
      default:
        return 'border-white/60 ring-2 ring-white/20';
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="text-center">
        <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
          Tahap 2 dari 4
        </span>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
          Pengambilan Foto Wajah Mandiri
        </h2>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Posisikan wajah Anda tegak lurus menghadap kamera di dalam lingkaran panduan. Foto diambil langsung menggunakan kamera perangkat.
        </p>
      </div>

      {!isReviewing ? (
        <div className="space-y-4">
          {/* Kamera Viewport */}
          <div className="relative mx-auto max-w-md aspect-[3/4] sm:aspect-[4/5] bg-slate-950 rounded-3xl overflow-hidden border-2 border-slate-800 shadow-xl flex items-center justify-center">
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

            {/* Panduan Visual Oval Framing */}
            {cameraActive && !cameraError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10 p-4">
                {/* Oval Panduan Wajah */}
                <div
                  className={`w-[68%] h-[68%] rounded-[50%/60%] border-4 transition-all duration-300 flex items-center justify-center ${getGuideBorderColor()}`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                </div>

                {/* Indikator Status Framing Real-Time */}
                <div className="mt-4 px-3.5 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md border border-white/20 text-white text-xs font-medium flex items-center gap-2 shadow-lg">
                  {framingResult.status === 'PERFECT' ? (
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                  )}
                  <span>{framingResult.message}</span>
                </div>
              </div>
            )}

            {/* Tombol Ganti Kamera (Depan / Belakang) */}
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
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                ← Kembali ke Data
              </button>
            ) : <div />}

            <button
              type="button"
              disabled={!cameraActive || cameraError !== null}
              onClick={capturePhoto}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-md transition-all ${
                framingResult.isFramed
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Camera size={16} />
              <span>{framingResult.isFramed ? 'Ambil Foto Wajah Sekarang' : 'Ambil Foto'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Pratinjau & Konfirmasi Foto Wajah */
        <div className="space-y-4">
          <div className="relative mx-auto max-w-md aspect-[3/4] sm:aspect-[4/5] bg-slate-100 rounded-3xl overflow-hidden border-2 border-slate-200 shadow-md flex items-center justify-center">
            {photoDataUrl && (
              // Foto ditampilkan sesuai kondisi nyata (tanpa mirror)
              <img
                src={photoDataUrl}
                alt="Pratinjau Foto Wajah"
                className="w-full h-full object-cover"
                style={{ transform: 'none' }}
              />
            )}
            <div className="absolute bottom-3 left-3 right-3 bg-slate-900/80 backdrop-blur-md p-2 rounded-xl text-center text-white text-[11px]">
              Foto Wajah Referensi Terpilih
            </div>
          </div>

          <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 space-y-1">
            <p className="font-semibold">Periksa kembali hasil foto Anda:</p>
            <p className="text-[11px] text-blue-700 leading-relaxed">
              Pastikan wajah terlihat jelas, tidak buram, menghadap lurus ke depan, dan pencahayaan mencukupi. Foto ini akan dicocokkan secara manual oleh petugas TU dengan kartu identitas Anda.
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
