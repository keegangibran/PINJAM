import { SignJWT, jwtVerify, errors } from 'jose';
import { getServerEnv } from '@/lib/env';

export const QR_TOKEN_LIFETIME_SECONDS = 60;

export interface QrPassPayload {
  sub: string;
  v: number;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export type QrTokenErrorCode =
  | 'EMPTY_TOKEN'
  | 'INVALID_FORMAT'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED'
  | 'VERSION_MISMATCH'
  | 'FORBIDDEN_PII_PRESENT'
  | 'INVALID_PAYLOAD';

export type QrTokenVerificationResult =
  | {
      valid: true;
      payload: {
        studentId: string;
        tokenVersion: number;
        issuedAt: number;
        expiresAt: number;
      };
    }
  | {
      valid: false;
      error: QrTokenErrorCode;
      message: string;
    };

/**
 * Daftar field identitas pribadi (PII) yang DILARANG KERAS berada di dalam QR Pass.
 */
const FORBIDDEN_PII_KEYS = [
  'nim',
  'name',
  'nama',
  'email',
  'nik',
  'phone',
  'photo',
  'document',
  'ktp',
  'ktm',
];

/**
 * Mendapatkan kunci rahasia HS256 dalam bentuk Uint8Array.
 */
function getSecretKey(customSecret?: string): Uint8Array {
  const secret = customSecret ?? getServerEnv().QR_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('QR_TOKEN_SECRET tidak valid atau kurang dari 32 karakter.');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Membuat token QR Pass bertanda tangan JWS HS256 berumur 60 detik.
 * Payload minimal: { sub: studentId, v: tokenVersion, iat, exp }.
 * DILARANG menyertakan NIM, Nama, Email, atau dokumen.
 */
export async function generateQrPassToken(params: {
  studentId: string;
  tokenVersion: number;
  secret?: string;
}): Promise<string> {
  const { studentId, tokenVersion, secret } = params;

  if (!studentId || typeof studentId !== 'string') {
    throw new Error('studentId wajib diisi dan harus berupa string.');
  }

  if (typeof tokenVersion !== 'number' || tokenVersion < 1) {
    throw new Error('tokenVersion harus berupa integer positif (>= 1).');
  }

  const secretKey = getSecretKey(secret);

  const token = await new SignJWT({
    v: tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(studentId)
    .setIssuedAt()
    .setExpirationTime(`${QR_TOKEN_LIFETIME_SECONDS}s`)
    .sign(secretKey);

  return token;
}

/**
 * Memverifikasi integritas, tanda tangan, masa berlaku, dan versi token QR Pass.
 */
export async function verifyQrPassToken(params: {
  token: string;
  expectedVersion?: number;
  secret?: string;
}): Promise<QrTokenVerificationResult> {
  const { token, expectedVersion, secret } = params;

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return {
      valid: false,
      error: 'EMPTY_TOKEN',
      message: 'Token QR tidak boleh kosong.',
    };
  }

  let secretKey: Uint8Array;
  try {
    secretKey = getSecretKey(secret);
  } catch (err) {
    return {
      valid: false,
      error: 'INVALID_SIGNATURE',
      message: err instanceof Error ? err.message : 'Kunci penandatanganan tidak valid.',
    };
  }

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    // 1. Verifikasi ketiadaan PII
    for (const forbiddenKey of FORBIDDEN_PII_KEYS) {
      if (forbiddenKey in payload) {
        return {
          valid: false,
          error: 'FORBIDDEN_PII_PRESENT',
          message: `Pelanggaran Privasi: Token mengandung data terlarang (${forbiddenKey}).`,
        };
      }
    }

    // 2. Verifikasi tipe data payload dasar
    const studentId = payload.sub;
    const tokenVersion = payload.v;
    const issuedAt = payload.iat;
    const expiresAt = payload.exp;

    if (!studentId || typeof studentId !== 'string') {
      return {
        valid: false,
        error: 'INVALID_PAYLOAD',
        message: 'Payload token tidak memuat subject (studentId) yang valid.',
      };
    }

    if (typeof tokenVersion !== 'number') {
      return {
        valid: false,
        error: 'INVALID_PAYLOAD',
        message: 'Payload token tidak memuat versi token yang valid.',
      };
    }

    // 3. Verifikasi token version terhadap versi terkini yang dicatat server
    if (expectedVersion !== undefined && tokenVersion !== expectedVersion) {
      return {
        valid: false,
        error: 'VERSION_MISMATCH',
        message: `Versi QR Pass usang (versi token: ${tokenVersion}, versi aktif: ${expectedVersion}). Silakan muat ulang layar QR.`,
      };
    }

    return {
      valid: true,
      payload: {
        studentId,
        tokenVersion,
        issuedAt: issuedAt ?? Math.floor(Date.now() / 1000),
        expiresAt: expiresAt ?? Math.floor(Date.now() / 1000) + QR_TOKEN_LIFETIME_SECONDS,
      },
    };
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      return {
        valid: false,
        error: 'EXPIRED',
        message: 'QR Pass sudah kedaluwarsa (masa berlaku 60 detik telah habis).',
      };
    }

    if (
      err instanceof errors.JWSSignatureVerificationFailed ||
      err instanceof errors.JWSInvalid
    ) {
      return {
        valid: false,
        error: 'INVALID_SIGNATURE',
        message: 'Tanda tangan kriptografis QR Pass tidak valid atau token telah diubah.',
      };
    }

    return {
      valid: false,
      error: 'INVALID_FORMAT',
      message: 'Format token QR Pass tidak valid.',
    };
  }
}
