import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import KioskPage from '@/app/kiosk/page';
import {
  canSubmitKioskTransaction,
  executeDirectReturnTransition,
  executeManualLookupSession,
  executeProjectorQrScan,
  executeStudentQrScan,
  formatKioskDueAt,
  type KioskProjectorInfo,
  type KioskStudentInfo,
} from '@/lib/kiosk-workflow';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

const MOCK_STUDENT_A: KioskStudentInfo = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Budi Santoso',
  nim: '230101001',
  class_name: 'TI 2023-A (2026/2027 Ganjil)',
  profile_photo_signed_url: null,
  identification_method: 'QR',
};

const MOCK_STUDENT_B: KioskStudentInfo = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Siti Aminah',
  nim: '230101002',
  class_name: 'TI 2023-B (2026/2027 Ganjil)',
  profile_photo_signed_url: null,
  identification_method: 'QR',
};

function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Kiosk Integration & Workflow Tests (src/lib/kiosk-workflow.ts & src/app/kiosk/page.tsx)', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
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
  });

  describe('Step 1 -> Step 2: QR Pass & Manual/USB Input', () => {
    it('verifies valid QR Pass callback, stops Step 1 scanner, and transitions to Step 2', async () => {
      const order: string[] = [];
      const stopScanner = vi.fn(async () => {
        order.push('stop-scanner-start');
        await new Promise((r) => setTimeout(r, 10));
        order.push('stop-scanner-done');
      });

      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        order.push('fetch-session');
        expect(input).toBe('/api/kiosk/session');
        expect(JSON.parse(String(init?.body))).toEqual({ student_token: 'eyJhbGci.valid.token' });
        return createJsonResponse(200, {
          success: true,
          data: {
            kiosk_session_id: 'sess-001',
            student: MOCK_STUDENT_A,
          },
        });
      });

      const result = await executeStudentQrScan({
        token: '  eyJhbGci.valid.token\r\n',
        stopScanner,
        fetchImpl: fetchMock,
      });
      order.push('entered-step-2');

      expect(result).toEqual({
        ok: true,
        kioskSessionId: 'sess-001',
        student: MOCK_STUDENT_A,
        nextStep: 2,
      });
      expect(stopScanner).toHaveBeenCalledTimes(1);
      expect(order).toEqual([
        'fetch-session',
        'stop-scanner-start',
        'stop-scanner-done',
        'entered-step-2',
      ]);
    });

    it('keeps Step 1 scanner active on invalid/expired QR Pass without leaking token in error message', async () => {
      const secretToken = 'eyJhbGciOiJIUzI1NiJ9.SECRET_PAYLOAD.SIG';
      const stopScanner = vi.fn(async () => undefined);
      const fetchMock = vi.fn<typeof fetch>(async () =>
        createJsonResponse(400, {
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'QR Pass kedaluwarsa. Minta mahasiswa muat ulang QR Pass.',
          },
        })
      );

      const result = await executeStudentQrScan({
        token: secretToken,
        stopScanner,
        fetchImpl: fetchMock,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorMessage).toContain('kedaluwarsa');
        expect(result.errorMessage).not.toContain(secretToken);
        expect(result.errorMessage).not.toContain('SECRET_PAYLOAD');
      }
      expect(stopScanner).not.toHaveBeenCalled();
    });

    it('supports manual lookup (FR-16) and rejects reason shorter than 3 chars', async () => {
      const stopScanner = vi.fn(async () => undefined);
      const fetchMock = vi.fn<typeof fetch>(async () =>
        createJsonResponse(200, {
          success: true,
          data: {
            kiosk_session_id: 'sess-manual-1',
            student: { ...MOCK_STUDENT_A, identification_method: 'MANUAL_LOOKUP' },
          },
        })
      );

      const invalid = await executeManualLookupSession({
        studentId: MOCK_STUDENT_A.id,
        reason: 'ok',
        stopScanner,
        fetchImpl: fetchMock,
      });
      expect(invalid.ok).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();

      const valid = await executeManualLookupSession({
        studentId: MOCK_STUDENT_A.id,
        reason: 'HP ketua kelas habis baterai',
        stopScanner,
        fetchImpl: fetchMock,
      });
      expect(valid.ok).toBe(true);
      if (valid.ok) {
        expect(valid.nextStep).toBe(2);
        expect(valid.student.identification_method).toBe('MANUAL_LOOKUP');
      }
      expect(stopScanner).toHaveBeenCalledTimes(1);
    });
  });

  describe('Step 2 -> Step 3 & Camera Lifecycle Ordering', () => {
    it('stops Step 2 QR scanner completely before resolving Step 3 transition for AVAILABLE unit', async () => {
      const lifecycleEvents: string[] = [];
      const stopScanner = vi.fn(async () => {
        lifecycleEvents.push('qr-scanner-stopping');
        await new Promise((r) => setTimeout(r, 15));
        lifecycleEvents.push('qr-scanner-stopped-and-cleared');
      });

      const availableUnit: KioskProjectorInfo = {
        id: 'proj-1',
        code: 'PROJ-001',
        name: 'Epson EB-X500 Ruang 301',
        status: 'AVAILABLE',
      };

      const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
        lifecycleEvents.push('unit-lookup');
        expect(JSON.parse(String(init?.body))).toEqual({ projector_code: 'PROJ-001' });
        return createJsonResponse(200, { success: true, data: availableUnit });
      });

      const result = await executeProjectorQrScan({
        code: '  proj-001\n',
        isDirectReturnMode: false,
        scannedStudent: { id: MOCK_STUDENT_A.id, name: MOCK_STUDENT_A.name },
        stopScanner,
        fetchImpl: fetchMock,
      });
      lifecycleEvents.push('step3-photo-camera-eligible');

      expect(result).toEqual({
        ok: true,
        projector: availableUnit,
        returnerContext: null,
        nextStep: 3,
      });
      expect(lifecycleEvents).toEqual([
        'unit-lookup',
        'qr-scanner-stopping',
        'qr-scanner-stopped-and-cleared',
        'step3-photo-camera-eligible',
      ]);
    });

    it('rejects MAINTENANCE and INACTIVE units and keeps scanner on Step 2', async () => {
      const stopScanner = vi.fn(async () => undefined);
      const fetchMock = vi.fn<typeof fetch>(async () =>
        createJsonResponse(200, {
          success: true,
          data: {
            id: 'proj-m',
            code: 'TEST-PROJ-001',
            name: 'Unit Rusak',
            status: 'MAINTENANCE',
            notes: 'Lampu redup',
          },
        })
      );

      const res = await executeProjectorQrScan({
        code: 'TEST-PROJ-001',
        isDirectReturnMode: false,
        scannedStudent: { id: MOCK_STUDENT_A.id, name: MOCK_STUDENT_A.name },
        stopScanner,
        fetchImpl: fetchMock,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errorMessage).toContain('MAINTENANCE');
        expect(res.errorMessage).toContain('Lampu redup');
      }
      expect(stopScanner).not.toHaveBeenCalled();
    });
  });

  describe('Return Flows: Same Borrower, Different Student, and Direct Representative Return (FR-07)', () => {
    const borrowedUnit: KioskProjectorInfo = {
      id: 'proj-2',
      code: 'PROJ-002',
      name: 'BenQ MX550 Ruang 204',
      status: 'BORROWED',
      active_loan: {
        loan_id: 'loan-99',
        student_id: MOCK_STUDENT_A.id,
        student_name: MOCK_STUDENT_A.name,
        student_nim: MOCK_STUDENT_A.nim,
        class_name: MOCK_STUDENT_A.class_name,
        borrowed_at: '2026-11-12T01:00:00.000Z',
        due_at: '2026-11-12T10:00:00.000Z',
        is_overdue: false,
        profile_photo_signed_url: null,
      },
    };

    it('records BORROWER as default when same borrower returns via QR Pass', async () => {
      const stopScanner = vi.fn(async () => undefined);
      const fetchMock = vi.fn<typeof fetch>(async () =>
        createJsonResponse(200, { success: true, data: borrowedUnit })
      );

      const res = await executeProjectorQrScan({
        code: 'PROJ-002',
        isDirectReturnMode: false,
        scannedStudent: { id: MOCK_STUDENT_A.id, name: MOCK_STUDENT_A.name },
        stopScanner,
        fetchImpl: fetchMock,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.nextStep).toBe(3);
        expect(res.returnerContext?.isSameBorrower).toBe(true);
        expect(res.returnerContext?.defaultReturnerType).toBe('BORROWER');
        expect(res.returnerContext?.mismatchWarning).toBeNull();
      }

      expect(
        canSubmitKioskTransaction({
          projectorStatus: 'BORROWED',
          capturedPhoto: 'data:image/jpeg;base64,AAA',
          isSubmitting: false,
          returnerType: 'BORROWER',
          representativeName: '',
          representativeConfirmed: false,
        })
      ).toBe(true);
    });

    it('warns clearly, defaults to REPRESENTATIVE, and requires staff confirmation when different student scans BORROWED unit', async () => {
      const stopScanner = vi.fn(async () => undefined);
      const fetchMock = vi.fn<typeof fetch>(async () =>
        createJsonResponse(200, { success: true, data: borrowedUnit })
      );

      const res = await executeProjectorQrScan({
        code: 'PROJ-002',
        isDirectReturnMode: false,
        scannedStudent: { id: MOCK_STUDENT_B.id, name: MOCK_STUDENT_B.name },
        stopScanner,
        fetchImpl: fetchMock,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.returnerContext?.isSameBorrower).toBe(false);
        expect(res.returnerContext?.defaultReturnerType).toBe('REPRESENTATIVE');
        expect(res.returnerContext?.prefilledRepresentativeName).toBe(MOCK_STUDENT_B.name);
        expect(res.returnerContext?.mismatchWarning).toContain('berbeda dengan peminjam aktif');
      }

      // Belum terkonfirmasi -> tidak bisa submit meski nama terisi otomatis
      expect(
        canSubmitKioskTransaction({
          projectorStatus: 'BORROWED',
          capturedPhoto: 'data:image/jpeg;base64,AAA',
          isSubmitting: false,
          returnerType: 'REPRESENTATIVE',
          representativeName: MOCK_STUDENT_B.name,
          representativeConfirmed: false,
        })
      ).toBe(false);

      // Sudah dikonfirmasi petugas -> boleh submit
      expect(
        canSubmitKioskTransaction({
          projectorStatus: 'BORROWED',
          capturedPhoto: 'data:image/jpeg;base64,AAA',
          isSubmitting: false,
          returnerType: 'REPRESENTATIVE',
          representativeName: MOCK_STUDENT_B.name,
          representativeConfirmed: true,
        })
      ).toBe(true);
    });

    it('supports Direct Representative Return (FR-07 without QR Pass) and blocks AVAILABLE unit in direct mode', async () => {
      const stopScanner = vi.fn(async () => undefined);
      const transition = await executeDirectReturnTransition({ stopScanner });
      expect(stopScanner).toHaveBeenCalledTimes(1);
      expect(transition).toEqual({
        nextStep: 2,
        isDirectReturnMode: true,
        defaultReturnerType: 'REPRESENTATIVE',
      });

      // Jika di mode Pengembalian Langsung ternyata unit AVAILABLE -> tolak di Step 2
      const availableFetch = vi.fn<typeof fetch>(async () =>
        createJsonResponse(200, {
          success: true,
          data: { id: 'proj-1', code: 'PROJ-001', name: 'Unit A', status: 'AVAILABLE' },
        })
      );
      const availRes = await executeProjectorQrScan({
        code: 'PROJ-001',
        isDirectReturnMode: true,
        scannedStudent: null,
        stopScanner,
        fetchImpl: availableFetch,
      });
      expect(availRes.ok).toBe(false);
      if (!availRes.ok) {
        expect(availRes.errorMessage).toContain('AVAILABLE');
      }

      // Jika unit BORROWED -> masuk Step 3 sebagai REPRESENTATIVE dengan nama kosong wajib diisi
      const borrowedFetch = vi.fn<typeof fetch>(async () =>
        createJsonResponse(200, { success: true, data: borrowedUnit })
      );
      const retRes = await executeProjectorQrScan({
        code: 'PROJ-002',
        isDirectReturnMode: true,
        scannedStudent: null,
        stopScanner,
        fetchImpl: borrowedFetch,
      });
      expect(retRes.ok).toBe(true);
      if (retRes.ok) {
        expect(retRes.nextStep).toBe(3);
        expect(retRes.returnerContext?.defaultReturnerType).toBe('REPRESENTATIVE');
        expect(retRes.returnerContext?.prefilledRepresentativeName).toBe('');
      }

      // Nama perwakilan kosong -> tetap ditolak
      expect(
        canSubmitKioskTransaction({
          projectorStatus: 'BORROWED',
          capturedPhoto: 'data:image/jpeg;base64,AAA',
          isSubmitting: false,
          returnerType: 'REPRESENTATIVE',
          representativeName: '   ',
          representativeConfirmed: true,
        })
      ).toBe(false);
    });
  });

  describe('WIB Formatting & KioskPage SSR Rendering', () => {
    it('formats due_at consistently in Asia/Jakarta (WIB) regardless of host timezone', () => {
      // 2026-11-12T10:00:00.000Z === 17:00 WIB
      const formatted = formatKioskDueAt('2026-11-12T10:00:00.000Z');
      expect(formatted).toContain('17.00 WIB');
      expect(formatted).toContain('12 Nov 2026');
    });

    it('renders KioskPage on SSR with webcam scanner slot, Direct Return button, FR-16 label, and manual/USB input', () => {
      delete (globalThis as { window?: unknown }).window;
      delete (globalThis as { navigator?: unknown }).navigator;

      const html = renderToStaticMarkup(React.createElement(KioskPage));

      expect(html).toContain('Pindai QR Pass Mahasiswa');
      expect(html).toContain('Pengembalian Langsung (Perwakilan)');
      expect(html).toContain('Pencarian Manual (FR-16)');
      expect(html).not.toContain('FR-08');
      expect(html).toContain('Input Manual / Scanner Barcode USB:');
      expect(html).toContain('Tempelkan atau ketik token QR Pass di sini lalu Enter...');
    });
  });
});

