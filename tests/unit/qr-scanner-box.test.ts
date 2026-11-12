import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CameraDevice } from 'html5-qrcode';
import QrScannerBox, {
  createQrScannerController,
  type Html5QrcodeInstance,
  type QrScannerLifecycleSnapshot,
  type QrScannerModuleAdapter,
} from '@/components/kiosk/QrScannerBox';

const mockHtml5GetCameras = vi.fn<() => Promise<CameraDevice[]>>();
const mockHtml5Start = vi.fn<Html5QrcodeInstance['start']>();
const mockHtml5Stop = vi.fn<Html5QrcodeInstance['stop']>();
const mockHtml5Clear = vi.fn<Html5QrcodeInstance['clear']>();
const mockHtml5GetState = vi.fn<() => number>();
const mockHtml5Ctor = vi.fn<(elementId: string, config?: unknown) => void>();

vi.mock('html5-qrcode', () => {
  class MockHtml5Qrcode {
    constructor(elementId: string, config?: unknown) {
      mockHtml5Ctor(elementId, config);
    }

    static getCameras() {
      return mockHtml5GetCameras();
    }

    start(
      cameraIdOrConfig: Parameters<Html5QrcodeInstance['start']>[0],
      configuration: Parameters<Html5QrcodeInstance['start']>[1],
      qrCodeSuccessCallback: Parameters<Html5QrcodeInstance['start']>[2],
      qrCodeErrorCallback: Parameters<Html5QrcodeInstance['start']>[3]
    ) {
      return mockHtml5Start(
        cameraIdOrConfig,
        configuration,
        qrCodeSuccessCallback,
        qrCodeErrorCallback
      );
    }

    stop() {
      return mockHtml5Stop();
    }

    clear() {
      return mockHtml5Clear();
    }

    getState() {
      return mockHtml5GetState();
    }
  }

  return {
    Html5Qrcode: MockHtml5Qrcode,
    Html5QrcodeSupportedFormats: {
      QR_CODE: 0,
    },
  };
});

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMockAdapter(overrides?: {
  cameras?: CameraDevice[];
  getCamerasImpl?: () => Promise<CameraDevice[]>;
  startImpl?: Html5QrcodeInstance['start'];
  stopImpl?: Html5QrcodeInstance['stop'];
  clearImpl?: Html5QrcodeInstance['clear'];
  state?: number;
  supported?: { supported: true } | { supported: false; error: unknown };
  hasContainer?: boolean;
}) {
  let capturedSuccessCb: ((decodedText: string) => void) | undefined;
  let capturedErrorCb: ((errorMessage: string) => void) | undefined;
  let currentState = overrides?.state ?? 2; // 2 = SCANNING

  const start = vi.fn<Html5QrcodeInstance['start']>(async (cam, cfg, onSuccess, onError) => {
    capturedSuccessCb = onSuccess;
    capturedErrorCb = onError;
    if (overrides?.startImpl) {
      return overrides.startImpl(cam, cfg, onSuccess, onError);
    }
    currentState = 2;
    return null;
  });

  const stop = vi.fn<Html5QrcodeInstance['stop']>(async () => {
    if (overrides?.stopImpl) {
      return overrides.stopImpl();
    }
    currentState = 1; // NOT_STARTED
  });

  const clear = vi.fn<Html5QrcodeInstance['clear']>(() => {
    if (overrides?.clearImpl) {
      overrides.clearImpl();
    }
  });

  const getCameras = vi.fn<() => Promise<CameraDevice[]>>(async () => {
    if (overrides?.getCamerasImpl) {
      return overrides.getCamerasImpl();
    }
    return overrides?.cameras ?? [{ id: 'cam-1', label: 'Webcam Depan' }];
  });

  const adapter: QrScannerModuleAdapter = {
    getCameras,
    createInstance: vi.fn(() => ({
      start,
      stop,
      clear,
      getState: () => currentState,
    })),
    checkEnvironmentSupport: () => overrides?.supported ?? { supported: true },
    hasContainerElement: () => overrides?.hasContainer ?? true,
  };

  return {
    adapter,
    spies: { getCameras, start, stop, clear },
    triggerDecode: (text: string) => capturedSuccessCb?.(text),
    triggerFrameError: (msg: string) => capturedErrorCb?.(msg),
    setState: (state: number) => {
      currentState = state;
    },
  };
}

describe('QrScannerBox & Controller Unit Tests (src/components/kiosk/QrScannerBox.tsx)', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHtml5GetState.mockReturnValue(2);
    mockHtml5Start.mockResolvedValue(null);
    mockHtml5Stop.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    }
    if (originalNavigator === undefined) {
      delete (globalThis as { navigator?: unknown }).navigator;
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
      });
    }
    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        configurable: true,
      });
    }
  });

  it('initializes and starts dynamic html5-qrcode adapter cleanly in secure browser context', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { isSecureContext: true },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: { getUserMedia: vi.fn() } },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: { getElementById: vi.fn((id: string) => (id === 'scanner-el' ? {} : null)) },
      configurable: true,
    });

    mockHtml5GetCameras.mockResolvedValue([{ id: 'cam-usb', label: 'USB Camera' }]);

    const controller = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'STUDENT_QR',
      onScan: vi.fn(),
    });

    await controller.start();

    expect(mockHtml5GetCameras).toHaveBeenCalledTimes(1);
    expect(mockHtml5Ctor).toHaveBeenCalledWith('scanner-el', {
      verbose: false,
      formatsToSupport: [0],
    });
    expect(mockHtml5Start).toHaveBeenCalledWith(
      'cam-usb',
      expect.objectContaining({ fps: 10 }),
      expect.any(Function),
      expect.any(Function)
    );
    expect(controller.getSnapshot().status).toBe('scanning');
    expect(controller.getSnapshot().selectedCameraId).toBe('cam-usb');

    await controller.stop();
    expect(mockHtml5Stop).toHaveBeenCalledTimes(1);
    expect(mockHtml5Clear).toHaveBeenCalledTimes(1);
  });

  it('supports multiple cameras and switches camera cleanly without leaking previous stream', async () => {
    const cameras: CameraDevice[] = [
      { id: 'cam-front', label: 'Kamera Laptop' },
      { id: 'cam-ext', label: 'Kamera Eksternal' },
    ];
    const mock = createMockAdapter({ cameras });

    const controller = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'PROJECTOR_QR',
      adapter: mock.adapter,
      onScan: vi.fn(),
    });

    await controller.start();
    expect(controller.getSnapshot().cameras).toHaveLength(2);
    expect(controller.getSnapshot().selectedCameraId).toBe('cam-front');
    expect(mock.spies.start).toHaveBeenCalledWith(
      'cam-front',
      expect.any(Object),
      expect.any(Function),
      expect.any(Function)
    );

    await controller.start('cam-ext');
    expect(mock.spies.stop).toHaveBeenCalledTimes(1);
    expect(mock.spies.clear).toHaveBeenCalledTimes(1);
    expect(mock.spies.start).toHaveBeenLastCalledWith(
      'cam-ext',
      expect.any(Object),
      expect.any(Function),
      expect.any(Function)
    );
    expect(controller.getSnapshot().selectedCameraId).toBe('cam-ext');
  });

  it('emits CAMERA_NOT_FOUND error when no camera devices exist', async () => {
    const mock = createMockAdapter({ cameras: [] });
    const controller = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'STUDENT_QR',
      adapter: mock.adapter,
      onScan: vi.fn(),
    });

    await controller.start();

    const snap = controller.getSnapshot();
    expect(snap.status).toBe('error');
    expect(snap.error?.code).toBe('CAMERA_NOT_FOUND');
    expect(mock.spies.start).not.toHaveBeenCalled();
  });

  it('maps NotAllowedError to PERMISSION_DENIED and NotReadableError to CAMERA_IN_USE', async () => {
    const deniedMock = createMockAdapter({
      getCamerasImpl: async () => {
        throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      },
    });

    const c1 = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'STUDENT_QR',
      adapter: deniedMock.adapter,
      onScan: vi.fn(),
    });
    await c1.start();
    expect(c1.getSnapshot().status).toBe('error');
    expect(c1.getSnapshot().error?.code).toBe('PERMISSION_DENIED');

    const busyMock = createMockAdapter({
      startImpl: async () => {
        throw Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' });
      },
    });
    const c2 = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'STUDENT_QR',
      adapter: busyMock.adapter,
      onScan: vi.fn(),
    });
    await c2.start();
    expect(c2.getSnapshot().status).toBe('error');
    expect(c2.getSnapshot().error?.code).toBe('CAMERA_IN_USE');
  });

  it('maps insecure or unsupported environment to UNSUPPORTED_CONTEXT', async () => {
    const mock = createMockAdapter({
      supported: {
        supported: false,
        error: Object.assign(new Error('HTTPS required'), { name: 'SecurityError' }),
      },
    });
    const controller = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'STUDENT_QR',
      adapter: mock.adapter,
      onScan: vi.fn(),
    });

    await controller.start();
    expect(controller.getSnapshot().status).toBe('error');
    expect(controller.getSnapshot().error?.code).toBe('UNSUPPORTED_CONTEXT');
    expect(mock.spies.getCameras).not.toHaveBeenCalled();
  });

  it('allows clean retry after instance.start() failure', async () => {
    let attempt = 0;
    const mock = createMockAdapter({
      startImpl: async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error('Transient driver error');
        }
        return null;
      },
    });

    const controller = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'STUDENT_QR',
      adapter: mock.adapter,
      onScan: vi.fn(),
    });

    await controller.start();
    expect(controller.getSnapshot().status).toBe('error');
    expect(controller.getSnapshot().error?.code).toBe('UNKNOWN_CAMERA_ERROR');

    await controller.start();
    expect(controller.getSnapshot().status).toBe('scanning');
    expect(controller.getSnapshot().error).toBeNull();
  });

  it('stops and cleans up stream safely without throwing on repeated stop()', async () => {
    const mock = createMockAdapter();
    const onScannerStopped = vi.fn();
    const controller = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'STUDENT_QR',
      adapter: mock.adapter,
      onScan: vi.fn(),
      onScannerStopped,
    });

    await controller.start();
    await Promise.all([controller.stop(), controller.stop()]);

    expect(mock.spies.stop).toHaveBeenCalledTimes(1);
    expect(mock.spies.clear).toHaveBeenCalledTimes(1);
    expect(onScannerStopped).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().status).toBe('stopped');
  });

  it('handles start/stop race condition cleanly when stop() is called while instance.start() is pending', async () => {
    const pendingStart = createDeferred<null>();
    const onScannerStopped = vi.fn();
    const mock = createMockAdapter({
      startImpl: async () => pendingStart.promise,
    });

    const controller = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'STUDENT_QR',
      adapter: mock.adapter,
      onScan: vi.fn(),
      onScannerStopped,
    });

    const startPromise = controller.start();
    // Tunggu sampai adapter.createInstance & instance.start dipanggil
    await vi.waitFor(() => {
      expect(mock.spies.start).toHaveBeenCalledTimes(1);
    });

    // Simulasikan unmount sebelum start() selesai
    const stopPromise = controller.stop();
    pendingStart.resolve(null);

    await Promise.all([startPromise, stopPromise]);

    expect(mock.spies.stop).toHaveBeenCalledTimes(1);
    expect(mock.spies.clear).toHaveBeenCalledTimes(1);
    expect(onScannerStopped).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().status).toBe('stopped');
  });

  it('handles React StrictMode synchronous and mid-flight start -> stop -> start without orphan streams', async () => {
    // 1. Synchronous StrictMode: Mount 1 dibatalkan oleh epoch guard sebelum getCameras dipanggil
    const syncEvents: string[] = [];
    const syncMock = createMockAdapter({
      getCamerasImpl: async () => {
        syncEvents.push('getCameras');
        return [{ id: 'cam-1', label: 'Webcam' }];
      },
      startImpl: async () => {
        syncEvents.push('instance-start');
        return null;
      },
    });
    const syncController = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'PROJECTOR_QR',
      adapter: syncMock.adapter,
      onScan: vi.fn(),
    });
    await Promise.all([syncController.start(), syncController.stop(), syncController.start()]);
    expect(syncEvents).toEqual(['getCameras', 'instance-start']);
    expect(syncController.getSnapshot().status).toBe('scanning');

    // 2. Mid-flight StrictMode: Mount 1 sudah menunggu getCameras ketika unmount -> remount terjadi
    const asyncEvents: string[] = [];
    const deferredFirstGetCameras = createDeferred<CameraDevice[]>();
    let callIdx = 0;

    const asyncMock = createMockAdapter({
      getCamerasImpl: async () => {
        callIdx += 1;
        asyncEvents.push(`getCameras-${callIdx}`);
        if (callIdx === 1) {
          return deferredFirstGetCameras.promise;
        }
        return [{ id: 'cam-1', label: 'Webcam' }];
      },
      startImpl: async () => {
        asyncEvents.push('instance-start');
        return null;
      },
      stopImpl: async () => {
        asyncEvents.push('instance-stop');
      },
      clearImpl: () => {
        asyncEvents.push('instance-clear');
      },
    });

    const asyncController = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'PROJECTOR_QR',
      adapter: asyncMock.adapter,
      onScan: vi.fn(),
    });

    const p1 = asyncController.start();
    await vi.waitFor(() => {
      expect(asyncEvents).toEqual(['getCameras-1']);
    });

    const p2 = asyncController.stop();
    const p3 = asyncController.start();

    deferredFirstGetCameras.resolve([{ id: 'cam-1', label: 'Webcam' }]);
    await Promise.all([p1, p2, p3]);

    // Mount 1 berhenti sebelum memanggil instance.start(); hanya Mount 2 yang start kamera
    expect(asyncEvents).toEqual(['getCameras-1', 'getCameras-2', 'instance-start']);
    expect(asyncController.getSnapshot().status).toBe('scanning');
  });

  it('prevents duplicate scan callbacks during processing and cooldown, and recovers on failed onScan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T10:00:00Z'));

    const mock = createMockAdapter();
    const scanDeferred = createDeferred<void>();
    const snapshots: QrScannerLifecycleSnapshot[] = [];
    const onScan = vi
      .fn<(payload: string) => Promise<void>>()
      .mockImplementationOnce(() => scanDeferred.promise)
      .mockRejectedValueOnce(new Error('API 401'))
      .mockResolvedValue(undefined);

    const controller = createQrScannerController({
      elementId: 'scanner-el',
      mode: 'STUDENT_QR',
      cooldownMs: 2500,
      adapter: mock.adapter,
      onScan,
      onStateChange: (s) => snapshots.push(s),
    });

    await controller.start();

    // Frame error diabaikan tanpa mengganggu status scanning
    mock.triggerFrameError('QR code parse error, error = NotFoundException');
    expect(controller.getSnapshot().status).toBe('scanning');

    // Scan pertama masuk -> status processing
    mock.triggerDecode('  token-abc-123  ');
    expect(controller.getSnapshot().status).toBe('processing');
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('token-abc-123');

    // Duplikasi saat masih processing harus ditolak
    mock.triggerDecode('token-abc-123');
    mock.triggerDecode('token-other');
    expect(onScan).toHaveBeenCalledTimes(1);

    // Selesaikan scan pertama -> kembali ke scanning, cooldown aktif untuk payload sama
    scanDeferred.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot().status).toBe('scanning');

    // Payload sama dalam cooldown (< 2500ms) ditolak
    vi.advanceTimersByTime(1000);
    mock.triggerDecode('token-abc-123');
    expect(onScan).toHaveBeenCalledTimes(1);

    // Payload berbeda langsung diterima; jika onScan gagal, status pulih ke scanning
    mock.triggerDecode('token-xyz-999');
    expect(onScan).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot().status).toBe('scanning');

    // Setelah cooldown lewat, payload pertama dapat dipindai ulang
    vi.advanceTimersByTime(2500);
    mock.triggerDecode('token-abc-123');
    expect(onScan).toHaveBeenCalledTimes(3);
    expect(snapshots.some((s) => s.status === 'processing')).toBe(true);
  });

  it('renders safely on SSR without window/navigator and without manual text inputs', () => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { navigator?: unknown }).navigator;

    const studentHtml = renderToStaticMarkup(
      React.createElement(QrScannerBox, {
        mode: 'STUDENT_QR',
        onScan: () => undefined,
      })
    );
    expect(studentHtml).toContain('Kamera Nonaktif');
    expect(studentHtml).toContain('Arahkan layar QR Pass mahasiswa tepat di depan kamera.');
    expect(studentHtml).not.toContain('<input');
    expect(studentHtml).not.toContain('<textarea');

    const projectorHtml = renderToStaticMarkup(
      React.createElement(QrScannerBox, {
        mode: 'PROJECTOR_QR',
        onScan: () => undefined,
        instructionText: 'Instruksi kustom unit proyektor',
      })
    );
    expect(projectorHtml).toContain('Instruksi kustom unit proyektor');
  });
});
