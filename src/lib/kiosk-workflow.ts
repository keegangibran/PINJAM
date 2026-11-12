import {
  normalizeQrToken,
  resolveReturnerContext,
  validateProjectorScanInput,
  type ReturnerContextResult,
} from '@/lib/kiosk-scanner';
import { formatWib } from '@/lib/timezone';

export interface KioskStudentInfo {
  id: string;
  name: string;
  nim: string;
  class_name: string;
  profile_photo_signed_url: string | null;
  identification_method: 'QR' | 'MANUAL_LOOKUP';
}

export interface KioskActiveLoanInfo {
  loan_id: string;
  student_id: string;
  student_name: string;
  student_nim: string;
  class_name: string;
  borrowed_at: string;
  due_at: string;
  is_overdue: boolean;
  profile_photo_signed_url: string | null;
}

export interface KioskProjectorInfo {
  id: string;
  code: string;
  name: string;
  status: 'AVAILABLE' | 'BORROWED' | 'MAINTENANCE' | 'INACTIVE';
  notes?: string;
  active_loan?: KioskActiveLoanInfo | null;
}

export interface KioskManualSearchStudent {
  id: string;
  name: string;
  nim: string;
  class_name: string;
  profile_photo_signed_url: string | null;
}

export interface KioskTransactionSuccess {
  action: 'BORROW' | 'RETURN';
  loan_id: string;
  projector_code: string;
  status: string;
  message: string;
}

export interface KioskWorkflowFailure {
  ok: false;
  errorMessage: string;
}

export interface StudentSessionSuccess {
  ok: true;
  kioskSessionId: string;
  student: KioskStudentInfo;
  nextStep: 2;
}

export interface ProjectorScanSuccess {
  ok: true;
  projector: KioskProjectorInfo;
  returnerContext: ReturnerContextResult | null;
  nextStep: 3;
}

interface ApiResponseBody<T> {
  success?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
}

/**
 * Memformat batas waktu pengembalian (due_at) secara konsisten ke Asia/Jakarta (WIB).
 */
export function formatKioskDueAt(dueAt: string): string {
  return formatWib(dueAt);
}

/**
 * Mengeksekusi verifikasi QR Pass mahasiswa (FR-03) dan menghentikan scanner Step 1
 * secara sinkron/await sebelum transisi ke Step 2.
 */
export async function executeStudentQrScan(params: {
  token: string;
  stopScanner: () => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<StudentSessionSuccess | KioskWorkflowFailure> {
  const normalizedToken = normalizeQrToken(params.token);
  if (!normalizedToken) {
    return {
      ok: false,
      errorMessage: 'Token QR Pass tidak boleh kosong.',
    };
  }

  const doFetch = params.fetchImpl ?? fetch;

  try {
    const res = await doFetch('/api/kiosk/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_token: normalizedToken }),
    });

    const json = (await res.json()) as ApiResponseBody<{
      kiosk_session_id: string;
      student: KioskStudentInfo;
    }>;

    if (!res.ok || !json.data) {
      return {
        ok: false,
        errorMessage: json.error?.message || 'QR Pass tidak valid atau sudah kedaluwarsa.',
      };
    }

    await params.stopScanner();

    return {
      ok: true,
      kioskSessionId: json.data.kiosk_session_id,
      student: json.data.student,
      nextStep: 2,
    };
  } catch {
    return {
      ok: false,
      errorMessage: 'Terjadi gangguan jaringan saat memverifikasi QR Pass.',
    };
  }
}

/**
 * Mengeksekusi sesi pencarian manual ketua kelas (FR-16) dan menghentikan scanner Step 1
 * sebelum berpindah ke Step 2.
 */
export async function executeManualLookupSession(params: {
  studentId: string | null;
  reason: string;
  stopScanner: () => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<StudentSessionSuccess | KioskWorkflowFailure> {
  if (!params.studentId) {
    return {
      ok: false,
      errorMessage: 'Pilih salah satu ketua kelas.',
    };
  }

  const trimmedReason = params.reason.trim();
  if (trimmedReason.length < 3) {
    return {
      ok: false,
      errorMessage: 'Alasan pencarian manual wajib diisi minimal 3 karakter.',
    };
  }

  const doFetch = params.fetchImpl ?? fetch;

  try {
    const res = await doFetch('/api/kiosk/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: params.studentId,
        reason: trimmedReason,
      }),
    });

    const json = (await res.json()) as ApiResponseBody<{
      kiosk_session_id: string;
      student: KioskStudentInfo;
    }>;

    if (!res.ok || !json.data) {
      return {
        ok: false,
        errorMessage: json.error?.message || 'Pencarian manual gagal.',
      };
    }

    await params.stopScanner();

    return {
      ok: true,
      kioskSessionId: json.data.kiosk_session_id,
      student: json.data.student,
      nextStep: 2,
    };
  } catch {
    return {
      ok: false,
      errorMessage: 'Gangguan jaringan saat memproses identifikasi manual.',
    };
  }
}

/**
 * Memasuki jalur Pengembalian Langsung oleh Perwakilan (FR-07) dari Step 1 -> Step 2
 * dengan memastikan scanner Step 1 berhenti terlebih dahulu.
 */
export async function executeDirectReturnTransition(params: {
  stopScanner: () => Promise<void>;
}): Promise<{
  nextStep: 2;
  isDirectReturnMode: true;
  defaultReturnerType: 'REPRESENTATIVE';
}> {
  await params.stopScanner();
  return {
    nextStep: 2,
    isDirectReturnMode: true,
    defaultReturnerType: 'REPRESENTATIVE',
  };
}

/**
 * Memeriksa status unit proyektor (Smart Toggle) dan menentukan konteks pengembali (FR-07).
 * Menghentikan scanner QR Step 2 secara tuntas sebelum mengizinkan transisi ke Step 3
 * agar webcam foto dokumentasi tidak pernah aktif bersamaan dengan scanner QR.
 */
export async function executeProjectorQrScan(params: {
  code: string;
  isDirectReturnMode: boolean;
  scannedStudent: { id: string; name: string } | null;
  stopScanner: () => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<ProjectorScanSuccess | KioskWorkflowFailure> {
  const validation = validateProjectorScanInput(params.code);
  if (!validation.valid) {
    return {
      ok: false,
      errorMessage: validation.message,
    };
  }

  const doFetch = params.fetchImpl ?? fetch;

  try {
    const res = await doFetch('/api/kiosk/unit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projector_code: validation.normalizedCode }),
    });

    const json = (await res.json()) as ApiResponseBody<KioskProjectorInfo>;

    if (!res.ok || !json.data) {
      return {
        ok: false,
        errorMessage:
          json.error?.message ||
          'Kode proyektor tidak ditemukan. Pastikan QR Code yang dipindai merupakan QR Code unit yang terdaftar.',
      };
    }

    const projData = json.data;

    if (projData.status === 'INACTIVE' || projData.status === 'MAINTENANCE') {
      return {
        ok: false,
        errorMessage: `Unit ${projData.code} berstatus ${projData.status} (${projData.notes || 'Tidak dapat digunakan'}).`,
      };
    }

    if (params.isDirectReturnMode && projData.status === 'AVAILABLE') {
      return {
        ok: false,
        errorMessage: `Unit ${projData.code} berstatus AVAILABLE (tidak sedang dipinjam). Untuk meminjam unit, kembali ke Langkah 1 dan pindai QR Pass ketua kelas terlebih dahulu.`,
      };
    }

    const returnerContext =
      projData.status === 'BORROWED'
        ? resolveReturnerContext({
            scannedStudent: params.scannedStudent,
            activeLoanBorrowerId: projData.active_loan?.student_id,
            isDirectReturnMode: params.isDirectReturnMode,
          })
        : null;

    await params.stopScanner();

    return {
      ok: true,
      projector: projData,
      returnerContext,
      nextStep: 3,
    };
  } catch {
    return {
      ok: false,
      errorMessage: 'Terjadi gangguan jaringan saat memverifikasi kode proyektor.',
    };
  }
}

/**
 * Validasi kelayakan tombol konfirmasi transaksi pada Step 3 sebelum mengirim ke server.
 */
export function canSubmitKioskTransaction(params: {
  projectorStatus: KioskProjectorInfo['status'] | undefined;
  capturedPhoto: string | null;
  isSubmitting: boolean;
  returnerType: 'BORROWER' | 'REPRESENTATIVE';
  representativeName: string;
  representativeConfirmed: boolean;
}): boolean {
  if (!params.capturedPhoto || params.isSubmitting || !params.projectorStatus) {
    return false;
  }

  if (params.projectorStatus === 'BORROWED' && params.returnerType === 'REPRESENTATIVE') {
    return params.representativeName.trim().length > 0 && params.representativeConfirmed;
  }

  return true;
}

