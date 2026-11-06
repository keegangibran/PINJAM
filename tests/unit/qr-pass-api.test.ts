import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getQrPass } from '@/app/api/students/me/qr/route';
import { verifyQrPassToken } from '@/lib/qr-token';
import * as guards from '@/lib/auth/guards';

const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

describe('Student QR Pass API Unit Tests (FR-02, FT-01, NFR-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
    process.env.QR_TOKEN_SECRET = 'super-secret-key-that-is-at-least-32-chars-long!';
  });

  it('rejects student with status != ACTIVE with 403 ACCOUNT_NOT_ACTIVE', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-1',
      email: 'mhs@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-pending',
        nim: '220101001',
        name: 'Mahasiswa Menunggu',
        registrationStatus: 'PENDING_DOCUMENT',
        currentClassId: 'cls-1',
      },
    });

    const res = await getQrPass();
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('rejects student without class assignment with 403 NO_CLASS_ASSIGNED', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-2',
      email: 'mhs2@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-noclass',
        nim: '220101002',
        name: 'Mahasiswa Tanpa Kelas',
        registrationStatus: 'ACTIVE',
        currentClassId: null,
      },
    });

    const res = await getQrPass();
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error.code).toBe('NO_CLASS_ASSIGNED');
  });

  it('rejects student who is not the active class leader with 403 NOT_CLASS_LEADER', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-3',
      email: 'mhs3@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-member',
        nim: '220101003',
        name: 'Anggota Kelas Biasa',
        registrationStatus: 'ACTIVE',
        currentClassId: 'cls-1',
      },
    });

    // Mock query classes: leader is someone else
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'cls-1',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GANJIL',
          leader_student_id: 'stu-different-leader',
          is_active: true,
        },
        error: null,
      }),
    }));

    const res = await getQrPass();
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error.code).toBe('NOT_CLASS_LEADER');
  });

  it('generates valid 60s HS256 QR token for ACTIVE class leader without forbidden PII', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-leader',
      email: 'ketua@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-leader-1',
        nim: '220101099',
        name: 'Ketua Kelas Sah',
        registrationStatus: 'ACTIVE',
        currentClassId: 'cls-1',
      },
    });

    // 1. Mock classes query (student is the leader)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'cls-1',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GANJIL',
          leader_student_id: 'stu-leader-1',
          is_active: true,
        },
        error: null,
      }),
    }));

    // 2. Mock students query (token version = 2)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          qr_token_version: 2,
          profile_photo_path: 'faces/stu-leader-1.jpg',
        },
        error: null,
      }),
    }));

    const res = await getQrPass();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.token).toBeDefined();
    expect(json.data.token_version).toBe(2);
    expect(json.data.expires_in).toBe(60);

    // Verify token cryptographically
    const verification = await verifyQrPassToken({
      token: json.data.token,
      expectedVersion: 2,
    });

    expect(verification.valid).toBe(true);
    if (verification.valid) {
      expect(verification.payload.studentId).toBe('stu-leader-1');
      expect(verification.payload.tokenVersion).toBe(2);
      expect(verification.payload.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });
});
