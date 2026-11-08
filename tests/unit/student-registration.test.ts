import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as registerStudent } from '@/app/api/students/profile/route';

// Mocks
const mockAdminFrom = vi.fn();
const mockSignUp = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signUp: mockSignUp,
    },
  })),
}));

describe('Student Registration API Unit Tests (POST /api/students/profile)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    name: 'Budi Santoso',
    nim: '4223121001',
    email: 'budi.santoso@unimed.ac.id',
    password: 'password123',
    class_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    consent: true,
  };

  it('rejects registration if consent is false (FR-01A)', async () => {
    const req = new Request('http://localhost/api/students/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validPayload,
        consent: false,
      }),
    });

    const res = await registerStudent(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects registration if chosen class is inactive or not found', async () => {
    // Mock classes query: class not found / inactive
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      }),
    });

    const req = new Request('http://localhost/api/students/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await registerStudent(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('INVALID_CLASS');
  });

  it('returns HTTP 409 EMAIL_ALREADY_REGISTERED when email already exists in Supabase Auth (identities empty)', async () => {
    // 1. Mock classes query: active class found
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: validPayload.class_id,
          study_program: 'Ilmu Komputer',
          cohort_year: 2025,
          section: 'B',
          academic_term: '2026/2027-GANJIL',
          is_active: true,
          leader_student_id: null,
        },
        error: null,
      }),
    });

    // 2. Mock students NIM check: no active student with this NIM
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: null,
      }),
    });

    // 3. Mock supabase.auth.signUp returning obfuscated fake user with empty identities
    mockSignUp.mockResolvedValueOnce({
      data: {
        user: {
          id: 'fake-obfuscated-uuid-1234',
          email: validPayload.email,
          identities: [], // <-- Indicates email already exists in Supabase GoTrue
        },
        session: null,
      },
      error: null,
    });

    const req = new Request('http://localhost/api/students/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await registerStudent(req);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(data.error.message).toContain('Alamat email ini sudah terdaftar');

    // Pastikan adminClient.from('students').insert() TIDAK dipanggil sama sekali!
    expect(mockAdminFrom).toHaveBeenCalledTimes(2); // Hanya class check & NIM check
  });

  it('successfully creates student profile and initial class leader claim for new email', async () => {
    // 1. Mock classes query: active class found
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: validPayload.class_id,
          study_program: 'Ilmu Komputer',
          cohort_year: 2025,
          section: 'B',
          academic_term: '2026/2027-GANJIL',
          is_active: true,
          leader_student_id: null,
        },
        error: null,
      }),
    });

    // 2. Mock students NIM check: no active student with this NIM
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: null,
      }),
    });

    // 3. Mock supabase.auth.signUp returning authentic new user with identities
    const newAuthUserId = 'real-auth-user-uuid-9999';
    mockSignUp.mockResolvedValueOnce({
      data: {
        user: {
          id: newAuthUserId,
          email: validPayload.email,
          identities: [{ id: 'identity-1' }],
          email_confirmed_at: null,
        },
        session: null,
      },
      error: null,
    });

    // 4. Mock students insert
    const studentDbId = 'std-new-uuid-8888';
    mockAdminFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: studentDbId,
          auth_user_id: newAuthUserId,
          nim: validPayload.nim,
          name: validPayload.name,
          registration_status: 'UNVERIFIED_EMAIL',
        },
        error: null,
      }),
    });

    // 5. Mock class_leader_claims existing initial claim check
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: null,
        error: null,
      }),
    });

    // 6. Mock class_leader_claims insert
    mockAdminFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'claim-1',
          class_id: validPayload.class_id,
          student_id: studentDbId,
          claim_type: 'INITIAL',
          status: 'PENDING',
        },
        error: null,
      }),
    });

    const req = new Request('http://localhost/api/students/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await registerStudent(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.student_id).toBe(studentDbId);
    expect(data.data.claim_type).toBe('INITIAL');
    expect(data.data.status).toBe('UNVERIFIED_EMAIL');
  });
});

