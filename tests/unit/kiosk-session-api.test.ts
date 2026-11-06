import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as createKioskSession } from '@/app/api/kiosk/session/route';
import { generateQrPassToken } from '@/lib/qr-token';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

const mockAdminFrom = vi.fn();
const mockCreateSignedUrl = vi.fn().mockResolvedValue({
  data: { signedUrl: 'https://mock.supabase.co/storage/v1/object/sign/faces/student.jpg' },
  error: null,
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: 'log-kiosk-1' }),
}));

describe('Kiosk Session API Unit Tests (FR-03, FR-08, FT-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
    process.env.QR_TOKEN_SECRET = 'super-secret-key-that-is-at-least-32-chars-long!';

    vi.spyOn(guards, 'requireStaff').mockResolvedValue({
      userId: 'usr-staff-1',
      email: 'petugas@unimed.ac.id',
      role: 'STAFF',
      staffProfile: { id: 'stf-1', name: 'Petugas Loket', role: 'STAFF', isActive: true },
    });
  });

  it('rejects invalid or expired QR Pass token with 400', async () => {
    const req = new Request('http://localhost/api/kiosk/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_token: 'invalid.jwt.token' }),
    });

    const res = await createKioskSession(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBeDefined();
  });

  it('rejects token if version does not match active qr_token_version in database (VERSION_MISMATCH)', async () => {
    const token = await generateQrPassToken({
      studentId: '11111111-1111-4111-a111-111111111111',
      tokenVersion: 1, // Token created with version 1
    });

    // Mock DB returns version 2 (token was revoked!)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: { qr_token_version: 2 },
      }),
    }));

    const req = new Request('http://localhost/api/kiosk/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_token: token }),
    });

    const res = await createKioskSession(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('VERSION_MISMATCH');
  });

  it('rejects student who is not ACTIVE with 403 ACCOUNT_NOT_ACTIVE', async () => {
    const token = await generateQrPassToken({
      studentId: '11111111-1111-4111-a111-111111111111',
      tokenVersion: 1,
    });

    // 1. Mock DB returns version 1
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({ data: { qr_token_version: 1 } }),
    }));

    // 2. Mock student profile: registration_status = PENDING_DOCUMENT
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '11111111-1111-4111-a111-111111111111',
          name: 'Belum Terverifikasi',
          nim: '220101001',
          registration_status: 'PENDING_DOCUMENT',
        },
      }),
    }));

    const req = new Request('http://localhost/api/kiosk/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_token: token }),
    });

    const res = await createKioskSession(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('creates valid 120s kiosk session for scanned active class leader and returns signed face photo URL', async () => {
    const token = await generateQrPassToken({
      studentId: '11111111-1111-4111-a111-111111111111',
      tokenVersion: 1,
    });

    // 1. Mock DB returns version 1
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({ data: { qr_token_version: 1 } }),
    }));

    // 2. Mock student profile (ACTIVE)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '11111111-1111-4111-a111-111111111111',
          name: 'Ketua Sah',
          nim: '220101099',
          registration_status: 'ACTIVE',
          current_class_id: '33333333-3333-4333-a333-333333333333',
          profile_photo_path: 'faces/stu-1.jpg',
        },
      }),
    }));

    // 3. Mock classes table (is active leader)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '33333333-3333-4333-a333-333333333333',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GANJIL',
          leader_student_id: '11111111-1111-4111-a111-111111111111',
          is_active: true,
        },
      }),
    }));

    // 4. Mock insert into kiosk_sessions
    const insertMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      insert: insertMock,
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'ksk-session-1',
          student_id: '11111111-1111-4111-a111-111111111111',
          identification_method: 'QR',
          expires_at: new Date(Date.now() + 120000).toISOString(),
        },
      }),
    }));

    const req = new Request('http://localhost/api/kiosk/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_token: token }),
    });

    const res = await createKioskSession(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.kiosk_session_id).toBe('ksk-session-1');
    expect(json.data.student.name).toBe('Ketua Sah');
    expect(json.data.student.identification_method).toBe('QR');
    expect(json.data.student.profile_photo_signed_url).toContain('storage/v1/object/sign/faces');
  });

  it('handles Manual Lookup (FR-08) with mandatory reason and writes MANUAL_LOOKUP audit log', async () => {
    // 1. Mock student profile (ACTIVE)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '11111111-1111-4111-a111-111111111111',
          name: 'Ketua Manual',
          nim: '220101099',
          registration_status: 'ACTIVE',
          current_class_id: '33333333-3333-4333-a333-333333333333',
          profile_photo_path: 'faces/stu-manual.jpg',
        },
      }),
    }));

    // 2. Mock classes table
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '33333333-3333-4333-a333-333333333333',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GANJIL',
          leader_student_id: '11111111-1111-4111-a111-111111111111',
          is_active: true,
        },
      }),
    }));

    // 3. Mock insert kiosk_sessions
    mockAdminFrom.mockImplementationOnce(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'ksk-session-manual-1',
          student_id: '11111111-1111-4111-a111-111111111111',
          identification_method: 'MANUAL_LOOKUP',
          expires_at: new Date(Date.now() + 120000).toISOString(),
        },
      }),
    }));

    const req = new Request('http://localhost/api/kiosk/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: '11111111-1111-4111-a111-111111111111',
        reason: 'HP ketua kehabisan baterai',
      }),
    });

    const res = await createKioskSession(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.student.identification_method).toBe('MANUAL_LOOKUP');

    // Verify audit log MANUAL_LOOKUP recorded
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'MANUAL_LOOKUP',
        metadata: expect.objectContaining({
          reason: 'HP ketua kehabisan baterai',
        }),
      })
    );
  });
});
