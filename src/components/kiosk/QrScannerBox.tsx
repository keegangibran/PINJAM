'use client';

import React, { useEffect, useId, useRef, useState, useCallback } from 'react';
import type { CameraDevice, Html5QrcodeCameraScanConfig } from 'html5-qrcode';
import {
  DEFAULT_SCAN_COOLDOWN_MS,
  canAcceptScan,
  createInitialScanGuardState,
  mapCameraError,
  markScanFinished,
  markScanStarted,
  normalizeProjectorCode,
  normalizeQrToken,
  type MappedCameraError,
  type ScanGuardState,
} from '@/lib/kiosk-scanner';

export type QrScannerMode = 'STUDENT_QR' | 'PROJECTOR_QR';

export type QrScannerStatus =
  | 'idle'
  | 'initializing'
  | 'scanning'
  | 'processing'
  | 'stopped'
  | 'error';

export interface QrScannerLifecycleSnapshot {
  status: QrScannerStatus;
  cameras: CameraDevice[];
  selectedCameraId: string | null;
  error: MappedCameraError | null;
}

export interface Html5QrcodeInstance {
  start: (
    cameraIdOrConfig: string | MediaTrackConstraints,
    configuration: Html5QrcodeCameraScanConfig | undefined,
    qrCodeSuccessCallback: ((decodedText: string) => void) | undefined,
    qrCodeErrorCallback: ((errorMessage: string) => void) | undefined
  ) => Promise<null>;
  stop: () => Promise<void>;
  clear: () => void;
  getState?: () => number;
}

export interface QrScannerModuleAdapter {
  getCameras: () => Promise<CameraDevice[]>;
  createInstance: (elementId: string) => Html5QrcodeInstance;
  checkEnvironmentSupport?: () => { supported: true } | { supported: false; error: unknown };
  hasContainerElement?: (elementId: string) => boolean;
}

export interface QrScannerControllerOptions {
  elementId: string;
  mode: QrScannerMode;
  cooldownMs?: number;
  adapter?: QrScannerModuleAdapter;
  onScan: (normalizedPayload: string) => void | Promise<void>;
  onStateChange?: (snapshot: QrScannerLifecycleSnapshot) => void;
  onScannerStopped?: () => void;
}

export interface QrScannerBoxProps {
  mode: QrScannerMode;
  onScan: (normalizedPayload: string) => void | Promise<void>;
  active?: boolean;
  onScannerStopped?: () => void;
  instructionText?: string;
  containerId?: string;
  cooldownMs?: number;
}

/**
 * Memuat modul html5-qrcode secara dinamis di sisi klien agar aman dari SSR Next.js.
 */
async function createDefaultScannerAdapter(): Promise<QrScannerModuleAdapter> {
  const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

  return {
    getCameras: () => Html5Qrcode.getCameras(),
    createInstance: (elementId: string) =>
      new Html5Qrcode(elementId, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      }),
    checkEnvironmentSupport: defaultCheckEnvironmentSupport,
    hasContainerElement: (elementId: string) =>
      typeof document !== 'undefined' && Boolean(document.getElementById(elementId)),
  };
}

function defaultCheckEnvironmentSupport():
  | { supported: true }
  | { supported: false; error: unknown } {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supported: false,
      error: Object.assign(new Error('Browser environment unavailable'), { name: 'SecurityError' }),
    };
  }

  if (window.isSecureContext === false) {
    return {
      supported: false,
      error: Object.assign(new Error('Camera requires secure context (HTTPS/localhost)'), {
        name: 'SecurityError',
      }),
    };
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return {
      supported: false,
      error: Object.assign(new Error('navigator.mediaDevices unavailable'), {
        name: 'SecurityError',
      }),
    };
  }

  return { supported: true };
}

async function safeStopAndClear(instance: Html5QrcodeInstance): Promise<void> {
  try {
    const state = typeof instance.getState === 'function' ? instance.getState() : undefined;
    // State 2 = SCANNING, 3 = PAUSED pada Html5QrcodeScannerState
    if (state === undefined || state === 2 || state === 3) {
      await instance.stop();
    }
  } catch {
    // Abaikan jika stream sudah berhenti sebelumnya agar cleanup tetap aman
  }

  try {
    instance.clear();
  } catch {
    // Abaikan jika elemen DOM sudah dilepas
  }
}

/**
 * Pengontrol lifecycle scanner kamera yang menserialisasi operasi start/stop melalui antrean
 * berurutan dan epoch token agar bebas race condition (termasuk saat React StrictMode).
 */
export function createQrScannerController(options: QrScannerControllerOptions) {
  const {
    elementId,
    cooldownMs = DEFAULT_SCAN_COOLDOWN_MS,
    onStateChange,
    onScannerStopped,
  } = options;

  let currentMode = options.mode;
  let currentOnScan = options.onScan;
  let opQueue: Promise<void> = Promise.resolve();
  let runEpoch = 0;
  let activeInstance: Html5QrcodeInstance | null = null;
  let scanGuard: ScanGuardState = createInitialScanGuardState();

  let snapshot: QrScannerLifecycleSnapshot = {
    status: 'idle',
    cameras: [],
    selectedCameraId: null,
    error: null,
  };

  const emitSnapshot = (patch: Partial<QrScannerLifecycleSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    onStateChange?.(snapshot);
  };

  const stopInternal = async () => {
    if (activeInstance) {
      const instanceToStop = activeInstance;
      activeInstance = null;
      await safeStopAndClear(instanceToStop);
      onScannerStopped?.();
    }
    scanGuard = createInitialScanGuardState();
  };

  const handleDecodedPayload = (rawText: string) => {
    const normalized =
      currentMode === 'STUDENT_QR'
        ? normalizeQrToken(rawText)
        : normalizeProjectorCode(rawText);

    const nowMs = Date.now();
    if (!canAcceptScan(scanGuard, normalized, nowMs, cooldownMs) || !normalized) {
      return;
    }

    scanGuard = markScanStarted(normalized, nowMs);
    emitSnapshot({ status: 'processing', error: null });

    const captureEpoch = runEpoch;
    Promise.resolve(currentOnScan(normalized))
      .catch(() => {
        // Error validasi/API ditangani oleh parent; scanner tetap pulih
      })
      .finally(() => {
        scanGuard = markScanFinished(scanGuard);
        if (captureEpoch === runEpoch && activeInstance) {
          emitSnapshot({ status: 'scanning' });
        }
      });
  };

  const start = (preferredCameraId?: string | null): Promise<void> => {
    const myEpoch = ++runEpoch;
    const requestedCameraId = preferredCameraId ?? snapshot.selectedCameraId;

    opQueue = opQueue.then(async () => {
      await stopInternal();

      if (myEpoch !== runEpoch) {
        return;
      }

      emitSnapshot({ status: 'initializing', error: null });

      let adapter: QrScannerModuleAdapter;
      try {
        adapter = options.adapter ?? (await createDefaultScannerAdapter());
      } catch (err) {
        if (myEpoch !== runEpoch) return;
        emitSnapshot({ status: 'error', error: mapCameraError(err) });
        return;
      }

      if (myEpoch !== runEpoch) {
        return;
      }

      const envCheck = (adapter.checkEnvironmentSupport ?? defaultCheckEnvironmentSupport)();
      if (!envCheck.supported) {
        emitSnapshot({ status: 'error', error: mapCameraError(envCheck.error) });
        return;
      }

      const containerExists = adapter.hasContainerElement
        ? adapter.hasContainerElement(elementId)
        : typeof document !== 'undefined' && Boolean(document.getElementById(elementId));

      if (!containerExists) {
        return;
      }

      let cameras: CameraDevice[];
      try {
        cameras = await adapter.getCameras();
      } catch (err) {
        if (myEpoch !== runEpoch) return;
        emitSnapshot({ status: 'error', error: mapCameraError(err) });
        return;
      }

      if (myEpoch !== runEpoch) {
        return;
      }

      if (!cameras || cameras.length === 0) {
        emitSnapshot({
          status: 'error',
          cameras: [],
          selectedCameraId: null,
          error: mapCameraError(
            Object.assign(new Error('No camera device found'), { name: 'NotFoundError' })
          ),
        });
        return;
      }

      const validPreferred =
        requestedCameraId && cameras.some((cam) => cam.id === requestedCameraId)
          ? requestedCameraId
          : cameras[0].id;

      let instance: Html5QrcodeInstance;
      try {
        instance = adapter.createInstance(elementId);
        await instance.start(
          validPreferred,
          {
            fps: 10,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.max(140, Math.min(240, Math.floor(minEdge * 0.72)));
              return { width: size, height: size };
            },
          },
          (decodedText: string) => {
            if (myEpoch !== runEpoch) return;
            handleDecodedPayload(decodedText);
          },
          () => {
            // Abaikan error per-frame saat kamera belum menemukan QR
          }
        );
      } catch (err) {
        if (myEpoch !== runEpoch) return;
        emitSnapshot({
          status: 'error',
          cameras,
          selectedCameraId: validPreferred,
          error: mapCameraError(err),
        });
        return;
      }

      // Jika komponen di-unmount atau stop dipanggil saat instance.start() masih berjalan,
      // segera hentikan stream agar tidak meninggalkan kamera menggantung.
      if (myEpoch !== runEpoch) {
        await safeStopAndClear(instance);
        onScannerStopped?.();
        return;
      }

      activeInstance = instance;
      scanGuard = createInitialScanGuardState();
      emitSnapshot({
        status: 'scanning',
        cameras,
        selectedCameraId: validPreferred,
        error: null,
      });
    });

    return opQueue;
  };

  const stop = (): Promise<void> => {
    ++runEpoch;
    opQueue = opQueue.then(async () => {
      const hadInstance = activeInstance !== null;
      await stopInternal();
      if (hadInstance || snapshot.status !== 'idle') {
        emitSnapshot({ status: 'stopped' });
      }
    });
    return opQueue;
  };

  const updateCallbacks = (nextMode: QrScannerMode, nextOnScan: QrScannerBoxProps['onScan']) => {
    if (currentMode !== nextMode) {
      scanGuard = createInitialScanGuardState();
    }
    currentMode = nextMode;
    currentOnScan = nextOnScan;
  };

  const getSnapshot = () => snapshot;

  return {
    start,
    stop,
    updateCallbacks,
    getSnapshot,
    /** Ekspos terbatas untuk pengujian alur decode frame */
    _handleDecodedPayloadForTest: handleDecodedPayload,
  };
}

export default function QrScannerBox({
  mode,
  onScan,
  active = true,
  onScannerStopped,
  instructionText,
  containerId,
  cooldownMs = DEFAULT_SCAN_COOLDOWN_MS,
}: QrScannerBoxProps) {
  const reactId = useId();
  const scannerElementId = containerId || `pinjam-qr-scanner-${reactId.replace(/:/g, '')}`;

  const [lifecycle, setLifecycle] = useState<QrScannerLifecycleSnapshot>({
    status: 'idle',
    cameras: [],
    selectedCameraId: null,
    error: null,
  });

  const controllerRef = useRef<ReturnType<typeof createQrScannerController> | null>(null);
  const onScanRef = useRef(onScan);
  const onStoppedRef = useRef(onScannerStopped);
  onScanRef.current = onScan;
  onStoppedRef.current = onScannerStopped;

  if (!controllerRef.current) {
    controllerRef.current = createQrScannerController({
      elementId: scannerElementId,
      mode,
      cooldownMs,
      onScan: (payload) => onScanRef.current(payload),
      onStateChange: (next) => setLifecycle(next),
      onScannerStopped: () => onStoppedRef.current?.(),
    });
  }

  useEffect(() => {
    controllerRef.current?.updateCallbacks(mode, (payload) => onScanRef.current(payload));
  }, [mode]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;

    if (active) {
      void controller.start();
    } else {
      void controller.stop();
    }

    return () => {
      void controller.stop();
    };
  }, [active, scannerElementId]);

  const handleCameraChange = useCallback((nextCameraId: string) => {
    const controller = controllerRef.current;
    if (!controller) return;
    void controller.start(nextCameraId);
  }, []);

  const handleRetry = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    void controller.start(lifecycle.selectedCameraId);
  }, [lifecycle.selectedCameraId]);

  const defaultInstruction =
    mode === 'STUDENT_QR'
      ? 'Arahkan layar QR Pass mahasiswa tepat di depan kamera.'
      : 'Arahkan stiker kode QR unit proyektor tepat di depan kamera.';

  const statusBadge = (() => {
    switch (lifecycle.status) {
      case 'initializing':
        return {
          text: 'Menyiapkan Kamera...',
          className: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        };
      case 'scanning':
        return {
          text: 'Kamera Aktif • Siap Memindai',
          className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        };
      case 'processing':
        return {
          text: 'Memproses Kode QR...',
          className: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        };
      case 'error':
        return {
          text: 'Kamera Tidak Tersedia',
          className: 'bg-red-500/20 text-red-300 border-red-500/30',
        };
      default:
        return {
          text: 'Kamera Nonaktif',
          className: 'bg-slate-800 text-slate-400 border-slate-700',
        };
    }
  })();

  return (
    <div className="w-full space-y-3">
      {/* Status Indicator & Camera Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusBadge.className}`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              lifecycle.status === 'scanning'
                ? 'bg-emerald-400 animate-pulse'
                : lifecycle.status === 'initializing'
                ? 'bg-blue-400 animate-pulse'
                : lifecycle.status === 'processing'
                ? 'bg-amber-400 animate-ping'
                : lifecycle.status === 'error'
                ? 'bg-red-400'
                : 'bg-slate-500'
            }`}
          />
          <span>{statusBadge.text}</span>
        </span>

        {lifecycle.cameras.length > 1 && (
          <div className="flex items-center gap-1.5">
            <label htmlFor={`${scannerElementId}-select`} className="text-[11px] text-slate-400">
              Kamera:
            </label>
            <select
              id={`${scannerElementId}-select`}
              value={lifecycle.selectedCameraId || ''}
              onChange={(e) => handleCameraChange(e.target.value)}
              disabled={lifecycle.status === 'initializing'}
              className="px-2.5 py-1 bg-slate-950 border border-slate-700 rounded-lg text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 max-w-[200px]"
            >
              {lifecycle.cameras.map((cam, idx) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || `Kamera ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Camera Preview Area */}
      <div className="relative w-full max-w-md mx-auto rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 aspect-[4/3] max-h-[280px] flex items-center justify-center shadow-inner">
        <div id={scannerElementId} className="w-full h-full" />

        {lifecycle.status === 'initializing' && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center space-y-2">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-medium text-slate-300">Menginisialisasi kamera webcam...</p>
          </div>
        )}

        {lifecycle.status === 'error' && lifecycle.error && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-5 text-center space-y-3">
            <span className="text-2xl" aria-hidden="true">
              📷
            </span>
            <p className="text-xs text-red-300 leading-relaxed max-w-xs">{lifecycle.error.message}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-600 transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {lifecycle.status === 'processing' && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none">
            <span className="px-3 py-1 rounded-full bg-slate-900/90 border border-amber-500/40 text-amber-300 text-[11px] font-semibold">
              Memverifikasi kode QR...
            </span>
          </div>
        )}
      </div>

      {/* Instruction */}
      <p className="text-center text-xs text-slate-400">
        {instructionText || defaultInstruction}
      </p>
    </div>
  );
}
