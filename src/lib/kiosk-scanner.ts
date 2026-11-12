/**
 * Utilitas murni untuk scanner QR Kiosk (FR-03, FR-07, FR-16).
 * Dirancang bebas ketergantungan DOM agar aman untuk SSR dan pengujian unit Node.
 */

export const DEFAULT_SCAN_COOLDOWN_MS = 2500;

export type CameraErrorCode =
  | 'PERMISSION_DENIED'
  | 'CAMERA_NOT_FOUND'
  | 'CAMERA_IN_USE'
  | 'CAMERA_CONSTRAINT_ERROR'
  | 'UNSUPPORTED_CONTEXT'
  | 'UNKNOWN_CAMERA_ERROR';

export interface MappedCameraError {
  code: CameraErrorCode;
  message: string;
}

export interface ScanGuardState {
  isProcessing: boolean;
  lastValue: string | null;
  lastScannedAt: number;
}

export interface ReturnerContextResult {
  isSameBorrower: boolean;
  defaultReturnerType: 'BORROWER' | 'REPRESENTATIVE';
  prefilledRepresentativeName: string;
  mismatchWarning: string | null;
}

export interface ProjectorScanValidationResult {
  valid: true;
  normalizedCode: string;
}

export interface ProjectorScanValidationError {
  valid: false;
  errorCode: 'VALIDATION_ERROR' | 'INVALID_PROJECTOR_QR_TYPE';
  message: string;
}

const THREE_PART_JWS_PATTERN = /^[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}$/;
const JWT_HEADER_PREFIX_PATTERN = /^eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?$/i;
const VALID_PROJECTOR_CODE_PATTERN = /^[A-Z0-9_-]{2,30}$/;

/**
 * Membersihkan whitespace, karakter CR/LF dari input scanner USB atau kamera QR Pass.
 * Mengembalikan null bila kosong. Tidak mengubah kapitalisasi token JWT.
 */
export function normalizeQrToken(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Membersihkan whitespace, karakter CR/LF, dan menyeragamkan huruf besar kode unit proyektor.
 * Mengembalikan null bila kosong.
 */
export function normalizeProjectorCode(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Mendeteksi apakah input hasil pemindaian menyerupai token JWS/JWT (mis. QR Pass mahasiswa).
 * Bekerja baik sebelum maupun sesudah normalisasi huruf besar.
 */
export function isLikelyJwsToken(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return THREE_PART_JWS_PATTERN.test(trimmed) || JWT_HEADER_PREFIX_PATTERN.test(trimmed);
}

/**
 * Memvalidasi input QR Code atau teks manual untuk unit proyektor sebelum lookup DB.
 * Menolak token JWS mahasiswa atau format non-unit tanpa mengembalikan nilai mentah input.
 */
export function validateProjectorScanInput(
  raw: string
): ProjectorScanValidationResult | ProjectorScanValidationError {
  const normalized = normalizeProjectorCode(raw);
  if (!normalized) {
    return {
      valid: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'Kode unit proyektor wajib diisi.',
    };
  }

  if (isLikelyJwsToken(normalized) || !VALID_PROJECTOR_CODE_PATTERN.test(normalized)) {
    return {
      valid: false,
      errorCode: 'INVALID_PROJECTOR_QR_TYPE',
      message:
        'QR Code tidak dikenali sebagai kode proyektor. Silakan pindai QR Code unit proyektor yang benar.',
    };
  }

  return {
    valid: true,
    normalizedCode: normalized,
  };
}

/**
 * Membuat state awal penjaga pemindaian ganda.
 */
export function createInitialScanGuardState(): ScanGuardState {
  return {
    isProcessing: false,
    lastValue: null,
    lastScannedAt: 0,
  };
}

/**
 * Menentukan apakah payload hasil decode layak diproses atau harus diabaikan
 * untuk mencegah request beruntun dari pemindaian frame berulang.
 */
export function canAcceptScan(
  state: ScanGuardState,
  normalizedValue: string | null,
  nowMs: number = Date.now(),
  cooldownMs: number = DEFAULT_SCAN_COOLDOWN_MS
): boolean {
  if (!normalizedValue) return false;
  if (state.isProcessing) return false;

  if (state.lastValue === normalizedValue && nowMs - state.lastScannedAt < cooldownMs) {
    return false;
  }

  return true;
}

/**
 * Menandai pemindaian sedang diproses ke server.
 */
export function markScanStarted(
  normalizedValue: string,
  nowMs: number = Date.now()
): ScanGuardState {
  return {
    isProcessing: true,
    lastValue: normalizedValue,
    lastScannedAt: nowMs,
  };
}

/**
 * Membuka kunci pemrosesan setelah request selesai (sukses/gagal),
 * sembari mempertahankan catatan nilai terakhir untuk cooldown debounce.
 */
export function markScanFinished(state: ScanGuardState): ScanGuardState {
  return {
    ...state,
    isProcessing: false,
  };
}

/**
 * Memetakan error perangkat keras / izin kamera ke pesan Bahasa Indonesia yang aman
 * tanpa mengekspos detail teknis sensitif atau token.
 */
export function mapCameraError(error: unknown): MappedCameraError {
  const errObj = error as { name?: string; message?: string } | null | undefined;
  const name = typeof errObj?.name === 'string' ? errObj.name : '';
  const rawMessage =
    typeof error === 'string'
      ? error
      : typeof errObj?.message === 'string'
      ? errObj.message
      : '';
  const combined = `${name} ${rawMessage}`.toLowerCase();

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    combined.includes('permission') ||
    combined.includes('denied') ||
    combined.includes('notallowed')
  ) {
    return {
      code: 'PERMISSION_DENIED',
      message:
        'Izin akses kamera ditolak. Berikan izin kamera di peramban atau gunakan kolom input manual / Pencarian Manual.',
    };
  }

  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    combined.includes('notfound') ||
    combined.includes('no camera') ||
    combined.includes('device not found') ||
    combined.includes('requested device not found')
  ) {
    return {
      code: 'CAMERA_NOT_FOUND',
      message:
        'Kamera webcam tidak ditemukan pada perangkat ini. Gunakan kolom input teks atau Pencarian Manual.',
    };
  }

  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    combined.includes('notreadable') ||
    combined.includes('in use') ||
    combined.includes('busy') ||
    combined.includes('could not start video source')
  ) {
    return {
      code: 'CAMERA_IN_USE',
      message:
        'Kamera sedang digunakan oleh aplikasi atau tab lain. Tutup aplikasi tersebut atau gunakan kolom input manual.',
    };
  }

  if (
    name === 'OverconstrainedError' ||
    name === 'ConstraintNotSatisfiedError' ||
    combined.includes('overconstrained')
  ) {
    return {
      code: 'CAMERA_CONSTRAINT_ERROR',
      message:
        'Kamera yang dipilih tidak mendukung konfigurasi pemindaian. Silakan pilih perangkat kamera lain.',
    };
  }

  if (
    name === 'SecurityError' ||
    combined.includes('mediadevices') ||
    combined.includes('https') ||
    combined.includes('secure context')
  ) {
    return {
      code: 'UNSUPPORTED_CONTEXT',
      message:
        'Akses kamera tidak didukung pada konteks ini (wajib HTTPS atau localhost). Gunakan input teks / Pencarian Manual.',
    };
  }

  return {
    code: 'UNKNOWN_CAMERA_ERROR',
    message:
      'Gagal mengaktifkan kamera pemindai. Pastikan webcam terhubung atau gunakan kolom input teks / Pencarian Manual.',
  };
}

/**
 * Menentukan konteks pengembalian (BORROWER vs REPRESENTATIVE) saat unit berstatus BORROWED
 * sesuai FR-07 dan aturan perbandingan peminjam aktif PRD 5.3.
 */
export function resolveReturnerContext(params: {
  scannedStudent: { id: string; name: string } | null;
  activeLoanBorrowerId: string | null | undefined;
  isDirectReturnMode: boolean;
}): ReturnerContextResult {
  const { scannedStudent, activeLoanBorrowerId, isDirectReturnMode } = params;

  if (isDirectReturnMode || !scannedStudent) {
    return {
      isSameBorrower: false,
      defaultReturnerType: 'REPRESENTATIVE',
      prefilledRepresentativeName: '',
      mismatchWarning: null,
    };
  }

  if (activeLoanBorrowerId && scannedStudent.id === activeLoanBorrowerId) {
    return {
      isSameBorrower: true,
      defaultReturnerType: 'BORROWER',
      prefilledRepresentativeName: '',
      mismatchWarning: null,
    };
  }

  return {
    isSameBorrower: false,
    defaultReturnerType: 'REPRESENTATIVE',
    prefilledRepresentativeName: scannedStudent.name,
    mismatchWarning:
      'Perhatian: Ketua kelas yang dipindai berbeda dengan peminjam aktif unit ini. Pengembalian tidak dicatat otomatis sebagai peminjam utama — pastikan identitas pengembali dicatat sebagai Perwakilan.',
  };
}

