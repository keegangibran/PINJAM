import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateQrPassToken,
  verifyQrPassToken,
  QR_TOKEN_LIFETIME_SECONDS,
} from '@/lib/qr-token';
import { SignJWT } from 'jose';

// Secret khusus unit testing (32 karakter acak)
const TEST_SECRET = 'test_secret_32_characters_long_key_12345';
const WRONG_SECRET = 'wrong_secret_32_characters_key_99999';

describe('QR Token Module (src/lib/qr-token.ts)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('A-1: Berhasil membuat dan memverifikasi token yang valid', async () => {
    const studentId = '550e8400-e29b-41d4-a716-446655440000';
    const tokenVersion = 1;

    const token = await generateQrPassToken({
      studentId,
      tokenVersion,
      secret: TEST_SECRET,
    });

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // Struktur JWS standar (header.payload.signature)

    const verification = await verifyQrPassToken({
      token,
      expectedVersion: tokenVersion,
      secret: TEST_SECRET,
    });

    expect(verification.valid).toBe(true);
    if (verification.valid) {
      expect(verification.payload.studentId).toBe(studentId);
      expect(verification.payload.tokenVersion).toBe(tokenVersion);
      expect(verification.payload.expiresAt - verification.payload.issuedAt).toBe(
        QR_TOKEN_LIFETIME_SECONDS
      );
    }
  });

  it('A-2: Menolak token yang telah kedaluwarsa (> 60 detik)', async () => {
    vi.useFakeTimers();
    const baseTime = new Date('2026-11-06T10:00:00Z');
    vi.setSystemTime(baseTime);

    const studentId = '550e8400-e29b-41d4-a716-446655440001';
    const token = await generateQrPassToken({
      studentId,
      tokenVersion: 1,
      secret: TEST_SECRET,
    });

    // Majukan waktu 61 detik (melewati TTL 60 detik)
    vi.advanceTimersByTime(61 * 1000);

    const result = await verifyQrPassToken({
      token,
      expectedVersion: 1,
      secret: TEST_SECRET,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('EXPIRED');
    }
  });

  it('A-3: Menolak token dengan signature yang tidak valid (tampered)', async () => {
    const studentId = '550e8400-e29b-41d4-a716-446655440002';
    const token = await generateQrPassToken({
      studentId,
      tokenVersion: 1,
      secret: TEST_SECRET,
    });

    // Memodifikasi bagian payload JWS
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}xyz.${parts[2]}`;

    const result = await verifyQrPassToken({
      token: tamperedToken,
      expectedVersion: 1,
      secret: TEST_SECRET,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('INVALID_SIGNATURE');
    }
  });

  it('A-4: Menolak token jika diverifikasi menggunakan secret yang salah', async () => {
    const studentId = '550e8400-e29b-41d4-a716-446655440003';
    const token = await generateQrPassToken({
      studentId,
      tokenVersion: 1,
      secret: TEST_SECRET,
    });

    const result = await verifyQrPassToken({
      token,
      expectedVersion: 1,
      secret: WRONG_SECRET,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('INVALID_SIGNATURE');
    }
  });

  it('A-5: Menolak token jika terjadi Version Mismatch (QR usang / dicabut)', async () => {
    const studentId = '550e8400-e29b-41d4-a716-446655440004';
    const token = await generateQrPassToken({
      studentId,
      tokenVersion: 1, // Token lama versi 1
      secret: TEST_SECRET,
    });

    // Server menyatakan versi aktif saat ini adalah 2 (setelah dicabut)
    const result = await verifyQrPassToken({
      token,
      expectedVersion: 2,
      secret: TEST_SECRET,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('VERSION_MISMATCH');
    }
  });

  it('A-6: Menolak token yang menyusupkan NIM ke dalam payload (Pelanggaran Privasi)', async () => {
    // Membuat token buatan secara langsung dengan klaim terlarang 'nim'
    const secretKey = new TextEncoder().encode(TEST_SECRET);
    const tokenWithNim = await new SignJWT({
      v: 1,
      nim: '4223121001', // DILARANG menurut PRD
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('550e8400-e29b-41d4-a716-446655440005')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(secretKey);

    const result = await verifyQrPassToken({
      token: tokenWithNim,
      expectedVersion: 1,
      secret: TEST_SECRET,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('FORBIDDEN_PII_PRESENT');
    }
  });

  it('A-7: Menolak token yang menyusupkan data pribadi lain (Nama, NIK, Dokumen)', async () => {
    const secretKey = new TextEncoder().encode(TEST_SECRET);
    const tokenWithPii = await new SignJWT({
      v: 1,
      name: 'Budi Santoso',
      nik: '1271010000000001',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('550e8400-e29b-41d4-a716-446655440006')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(secretKey);

    const result = await verifyQrPassToken({
      token: tokenWithPii,
      expectedVersion: 1,
      secret: TEST_SECRET,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('FORBIDDEN_PII_PRESENT');
    }
  });

  it('A-8: Menolak token kosong atau string sembarangan', async () => {
    const emptyResult = await verifyQrPassToken({
      token: '',
      secret: TEST_SECRET,
    });
    expect(emptyResult.valid).toBe(false);
    if (!emptyResult.valid) {
      expect(emptyResult.error).toBe('EMPTY_TOKEN');
    }

    const invalidFormatResult = await verifyQrPassToken({
      token: 'bukan.token.jwt.valid',
      secret: TEST_SECRET,
    });
    expect(invalidFormatResult.valid).toBe(false);
  });
});
