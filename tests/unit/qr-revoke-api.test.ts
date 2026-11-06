import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as revokeQrPass } from '@/app/api/students/me/qr/revoke/route';
import { generateQrPassToken, verifyQrPassToken } from '@/lib/qr-token';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: 'log-revoke-1' }),
}));

describe('Emergency QR Revocation API Unit Tests (FR-02, FT-01, NFR-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
    process.env.QR_TOKEN_SECRET = 'super-secret-key-that-is-at-least-32-chars-long!';
  });

  it('rejects student with status != ACTIVE with 403 ACCOUNT_NOT_ACTIVE', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-unverified',
      email: 'mhs@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-unverified',
        nim: '220101001',
        name: 'Mahasiswa Belum Aktif',
        registrationStatus: 'PENDING_DOCUMENT',
        currentClassId: 'cls-1',
      },
    });

    const res = await revokeQrPass();
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('increments qr_token_version, invalidates old token immediately, and records audit trail', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-leader',
      email: 'ketua@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-leader-1',
        nim: '220101099',
        name: 'Ketua Kelas',
        registrationStatus: 'ACTIVE',
        currentClassId: 'cls-1',
      },
    });

    // 1. Generate old token under version 1
    const oldToken = await generateQrPassToken({
      studentId: 'stu-leader-1',
      tokenVersion: 1,
    });

    // Old token should be valid when expectedVersion = 1
    const verifyBefore = await verifyQrPassToken({
      token: oldToken,
      expectedVersion: 1,
    });
    expect(verifyBefore.valid).toBe(true);

    // 2. Mock fetch current version (returns 1)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: { qr_token_version: 1 },
        error: null,
      }),
    }));

    // 3. Mock update version to 2
    const updateMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      update: updateMock,
      eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    }));

    const res = await revokeQrPass();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.new_version).toBe(2);

    // Verify DB update called with new version 2
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ qr_token_version: 2 })
    );

    // 4. Test that the old token is now REJECTED with VERSION_MISMATCH when checked against the new version 2
    const verifyAfter = await verifyQrPassToken({
      token: oldToken,
      expectedVersion: 2, // New server version
    });
    expect(verifyAfter.valid).toBe(false);
    if (!verifyAfter.valid) {
      expect(verifyAfter.error).toBe('VERSION_MISMATCH');
    }

    // 5. Verify audit log was recorded without token or secret
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'QR_REVOKED',
        entityType: 'students',
        entityId: 'stu-leader-1',
        actorStudentId: 'stu-leader-1',
        metadata: expect.objectContaining({
          previous_version: 1,
          new_version: 2,
        }),
      })
    );
  });
});

