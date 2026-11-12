import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SCAN_COOLDOWN_MS,
  normalizeQrToken,
  normalizeProjectorCode,
  isLikelyJwsToken,
  validateProjectorScanInput,
  createInitialScanGuardState,
  canAcceptScan,
  markScanStarted,
  markScanFinished,
  mapCameraError,
  resolveReturnerContext,
} from '@/lib/kiosk-scanner';

describe('Kiosk Scanner Helper Unit Tests (src/lib/kiosk-scanner.ts)', () => {
  describe('Payload Normalization', () => {
    it('normalizes QR Pass token without altering JWT casing', () => {
      expect(normalizeQrToken('  eyJhbGciOiJIUzI1NiJ9.AbCdEf.XyZ\r\n')).toBe(
        'eyJhbGciOiJIUzI1NiJ9.AbCdEf.XyZ'
      );
    });

    it('returns null for empty or whitespace-only QR tokens', () => {
      expect(normalizeQrToken('')).toBeNull();
      expect(normalizeQrToken('   \n\t  ')).toBeNull();
    });

    it('normalizes projector code by trimming and converting to uppercase', () => {
      expect(normalizeProjectorCode('  proj-001\r\n')).toBe('PROJ-001');
      expect(normalizeProjectorCode('Test-Proj-002')).toBe('TEST-PROJ-002');
    });

    it('returns null for empty or whitespace-only projector codes', () => {
      expect(normalizeProjectorCode('')).toBeNull();
      expect(normalizeProjectorCode('   \r\n ')).toBeNull();
    });

    it('detects JWS tokens and rejects non-projector QR payloads without echoing raw input', () => {
      const sampleJws =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidiI6MX0.AbCdEfGhIjKlMnOpQrStUvWxYz123456';
      expect(isLikelyJwsToken(sampleJws)).toBe(true);
      expect(isLikelyJwsToken(sampleJws.toUpperCase())).toBe(true);
      expect(isLikelyJwsToken('PROJ-001')).toBe(false);
      expect(isLikelyJwsToken('TEST-PROJ-001')).toBe(false);

      const jwsCheck = validateProjectorScanInput(sampleJws);
      expect(jwsCheck.valid).toBe(false);
      if (!jwsCheck.valid) {
        expect(jwsCheck.errorCode).toBe('INVALID_PROJECTOR_QR_TYPE');
        expect(jwsCheck.message).toBe(
          'QR Code tidak dikenali sebagai kode proyektor. Silakan pindai QR Code unit proyektor yang benar.'
        );
        expect(jwsCheck.message).not.toContain('eyJ');
        expect(jwsCheck.message).not.toContain('EYJ');
      }

      const urlCheck = validateProjectorScanInput('https://example.com/unknown?token=secret');
      expect(urlCheck.valid).toBe(false);
      if (!urlCheck.valid) {
        expect(urlCheck.errorCode).toBe('INVALID_PROJECTOR_QR_TYPE');
        expect(urlCheck.message).not.toContain('https://');
        expect(urlCheck.message).not.toContain('secret');
      }

      expect(validateProjectorScanInput('  proj-001\n')).toEqual({
        valid: true,
        normalizedCode: 'PROJ-001',
      });
    });
  });

  describe('Duplicate Scan Guard & Debounce', () => {
    it('blocks null payloads and prevents concurrent scans while processing', () => {
      const initial = createInitialScanGuardState();
      expect(canAcceptScan(initial, null, 1000)).toBe(false);
      expect(canAcceptScan(initial, 'PROJ-001', 1000)).toBe(true);

      const processing = markScanStarted('PROJ-001', 1000);
      expect(processing.isProcessing).toBe(true);
      expect(canAcceptScan(processing, 'PROJ-001', 1200)).toBe(false);
      expect(canAcceptScan(processing, 'PROJ-002', 1200)).toBe(false);
    });

    it('debounces identical value within cooldown but allows different value or expired cooldown', () => {
      const started = markScanStarted('PROJ-001', 1000);
      const finished = markScanFinished(started);
      expect(finished.isProcessing).toBe(false);

      // Identical code within cooldown -> blocked
      expect(canAcceptScan(finished, 'PROJ-001', 1000 + DEFAULT_SCAN_COOLDOWN_MS - 1)).toBe(false);

      // Different code immediately after finishing -> accepted
      expect(canAcceptScan(finished, 'PROJ-002', 1100)).toBe(true);

      // Identical code after cooldown expires -> accepted
      expect(canAcceptScan(finished, 'PROJ-001', 1000 + DEFAULT_SCAN_COOLDOWN_MS)).toBe(true);
    });
  });

  describe('Camera Error Mapping', () => {
    it('maps permission denied errors to Indonesian fallback guidance', () => {
      const err = Object.assign(new Error('Permission denied by user'), { name: 'NotAllowedError' });
      const mapped = mapCameraError(err);
      expect(mapped.code).toBe('PERMISSION_DENIED');
      expect(mapped.message).toContain('Izin akses kamera ditolak');
    });

    it('maps missing camera errors', () => {
      const err = Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' });
      const mapped = mapCameraError(err);
      expect(mapped.code).toBe('CAMERA_NOT_FOUND');
      expect(mapped.message).toContain('tidak ditemukan');
    });

    it('maps busy/in-use camera errors (NotReadableError / TrackStartError)', () => {
      const err = Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' });
      const mapped = mapCameraError(err);
      expect(mapped.code).toBe('CAMERA_IN_USE');
      expect(mapped.message).toContain('sedang digunakan');
    });

    it('maps constraint errors and unsupported non-HTTPS context errors', () => {
      const overErr = Object.assign(new Error('Constraint failed'), { name: 'OverconstrainedError' });
      expect(mapCameraError(overErr).code).toBe('CAMERA_CONSTRAINT_ERROR');

      const secErr = Object.assign(new Error('Only secure origins allowed'), { name: 'SecurityError' });
      expect(mapCameraError(secErr).code).toBe('UNSUPPORTED_CONTEXT');
    });

    it('falls back gracefully for unknown errors without exposing secrets', () => {
      const mapped = mapCameraError({ weird: true });
      expect(mapped.code).toBe('UNKNOWN_CAMERA_ERROR');
      expect(mapped.message).toContain('Gagal mengaktifkan kamera');
    });
  });

  describe('Returner Context Resolution (FR-07 & PRD 5.3)', () => {
    it('defaults to BORROWER when scanned student matches active loan borrower', () => {
      const result = resolveReturnerContext({
        scannedStudent: { id: 'stu-1', name: 'Budi Santoso' },
        activeLoanBorrowerId: 'stu-1',
        isDirectReturnMode: false,
      });

      expect(result.isSameBorrower).toBe(true);
      expect(result.defaultReturnerType).toBe('BORROWER');
      expect(result.prefilledRepresentativeName).toBe('');
      expect(result.mismatchWarning).toBeNull();
    });

    it('defaults to REPRESENTATIVE with blank name in Direct Return mode without student QR', () => {
      const result = resolveReturnerContext({
        scannedStudent: null,
        activeLoanBorrowerId: 'stu-1',
        isDirectReturnMode: true,
      });

      expect(result.isSameBorrower).toBe(false);
      expect(result.defaultReturnerType).toBe('REPRESENTATIVE');
      expect(result.prefilledRepresentativeName).toBe('');
      expect(result.mismatchWarning).toBeNull();
    });

    it('warns and defaults to REPRESENTATIVE when scanned student differs from active borrower', () => {
      const result = resolveReturnerContext({
        scannedStudent: { id: 'stu-2', name: 'Siti Aminah' },
        activeLoanBorrowerId: 'stu-1',
        isDirectReturnMode: false,
      });

      expect(result.isSameBorrower).toBe(false);
      expect(result.defaultReturnerType).toBe('REPRESENTATIVE');
      expect(result.prefilledRepresentativeName).toBe('Siti Aminah');
      expect(result.mismatchWarning).toContain('berbeda dengan peminjam aktif');
    });

    it('does not auto-select BORROWER if activeLoanBorrowerId is missing', () => {
      const result = resolveReturnerContext({
        scannedStudent: { id: 'stu-1', name: 'Budi Santoso' },
        activeLoanBorrowerId: null,
        isDirectReturnMode: false,
      });

      expect(result.isSameBorrower).toBe(false);
      expect(result.defaultReturnerType).toBe('REPRESENTATIVE');
      expect(result.mismatchWarning).toContain('Perwakilan');
    });
  });
});

