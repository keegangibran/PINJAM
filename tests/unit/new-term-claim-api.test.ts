import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as claimLeader, GET as getClaims } from '@/app/api/students/me/leader/claim/route';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: 'log-claim-1' }),
}));

describe('New Academic Term Leader Claim API Unit Tests (FR-01D, FR-01F, FT-04)', () => {
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
        id: 'stu-1',
        nim: '220101001',
        name: 'Mhs Unverified',
        registrationStatus: 'PENDING_DOCUMENT',
        currentClassId: null,
      },
    });

    const req = new Request('http://localhost/api/students/me/leader/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await claimLeader(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('rejects claim if class is not found with 404 CLASS_NOT_FOUND', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-active',
      email: 'mhs@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-active',
        nim: '220101001',
        name: 'Mhs Aktif',
        registrationStatus: 'ACTIVE',
        currentClassId: null,
      },
    });

    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Not found' } }),
    }));

    const req = new Request('http://localhost/api/students/me/leader/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await claimLeader(req);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error.code).toBe('CLASS_NOT_FOUND');
  });

  it('rejects claim if class is inactive with 400 CLASS_INACTIVE', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-active',
      email: 'mhs@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-active',
        nim: '220101001',
        name: 'Mhs Aktif',
        registrationStatus: 'ACTIVE',
        currentClassId: null,
      },
    });

    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'cls-inactive',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GENAP',
          leader_student_id: null,
          is_active: false,
        },
        error: null,
      }),
    }));

    const req = new Request('http://localhost/api/students/me/leader/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await claimLeader(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('CLASS_INACTIVE');
  });

  it('rejects claim if student is already the active leader of target class with 400 ALREADY_CLASS_LEADER', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-active',
      email: 'mhs@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-leader-id',
        nim: '220101001',
        name: 'Mhs Ketua Aktif',
        registrationStatus: 'ACTIVE',
        currentClassId: 'cls-1',
      },
    });

    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'cls-1',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GENAP',
          leader_student_id: 'stu-leader-id',
          is_active: true,
        },
        error: null,
      }),
    }));

    const req = new Request('http://localhost/api/students/me/leader/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await claimLeader(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('ALREADY_CLASS_LEADER');
  });

  it('rejects duplicate pending claim from the same student with 409 DUPLICATE_CLAIM', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-active',
      email: 'mhs@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-pending-user',
        nim: '220101001',
        name: 'Mhs Sudah Ajukan',
        registrationStatus: 'ACTIVE',
        currentClassId: null,
      },
    });

    // 1. Mock query class
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'cls-target',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GENAP',
          leader_student_id: null,
          is_active: true,
        },
        error: null,
      }),
    }));

    // 2. Mock query existing claim by this student -> returns an existing PENDING claim
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: { id: 'clm-existing-pending', status: 'PENDING' },
      }),
    }));

    const req = new Request('http://localhost/api/students/me/leader/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await claimLeader(req);
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error.code).toBe('DUPLICATE_CLAIM');
  });

  it('creates INITIAL pending claim on a class without leader and updates current_class_id', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-active',
      email: 'mhs@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-first',
        nim: '220101001',
        name: 'Mahasiswa Pertama',
        registrationStatus: 'ACTIVE',
        currentClassId: null,
      },
    });

    // 1. Mock query class (active class, leader_student_id is null)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'cls-new-term',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GENAP',
          leader_student_id: null,
          is_active: true,
        },
        error: null,
      }),
    }));

    // 2. Mock query existing student claim -> null
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }),
    }));

    // 3. Mock update student's current_class_id
    const updateStudentMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      update: updateStudentMock,
      eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    }));

    // 4. Mock query existing INITIAL claim returns null
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }),
    }));

    // 5. Mock insert claim
    const insertClaimMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      insert: insertClaimMock,
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: { id: 'clm-init-1', claim_type: 'INITIAL', status: 'PENDING' },
        error: null,
      }),
    }));

    const req = new Request('http://localhost/api/students/me/leader/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await claimLeader(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    // Verify current_class_id updated
    expect(updateStudentMock).toHaveBeenCalledWith(
      expect.objectContaining({ current_class_id: '11111111-1111-4111-a111-111111111111' })
    );

    // Verify claim created as INITIAL
    expect(insertClaimMock).toHaveBeenCalledWith(
      expect.objectContaining({
        claim_type: 'INITIAL',
        status: 'PENDING',
      })
    );
  });

  it('creates REPLACEMENT pending claim if class already has an active leader', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-active-2',
      email: 'mhs2@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-second',
        nim: '220101002',
        name: 'Mahasiswa Kedua',
        registrationStatus: 'ACTIVE',
        currentClassId: null,
      },
    });

    // 1. Mock query class (active class, leader_student_id is already set!)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'cls-taken',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GENAP',
          leader_student_id: 'stu-existing-leader',
          is_active: true,
        },
        error: null,
      }),
    }));

    // 2. Mock query existing student claim -> null
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }),
    }));

    // 3. Mock update student's current_class_id
    mockAdminFrom.mockImplementationOnce(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    }));

    // 4. Mock insert claim (should be REPLACEMENT)
    const insertClaimMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      insert: insertClaimMock,
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: { id: 'clm-repl-1', claim_type: 'REPLACEMENT', status: 'PENDING' },
        error: null,
      }),
    }));

    const req = new Request('http://localhost/api/students/me/leader/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await claimLeader(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    // Verify claim created as REPLACEMENT
    expect(insertClaimMock).toHaveBeenCalledWith(
      expect.objectContaining({
        claim_type: 'REPLACEMENT',
        status: 'PENDING',
      })
    );
  });

  it('GET returns claims history and pendingClaim for authenticated student', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-student',
      email: 'mhs@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-claimant',
        nim: '220101001',
        name: 'Mhs Klaim',
        registrationStatus: 'ACTIVE',
        currentClassId: null,
      },
    });

    const mockClaims = [
      {
        id: 'clm-1',
        class_id: 'cls-1',
        claim_type: 'INITIAL',
        status: 'PENDING',
        notes: 'Semester Baru',
        class: {
          id: 'cls-1',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GANJIL',
        },
      },
    ];

    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce({ data: mockClaims, error: null }),
    }));

    const res = await getClaims();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.claims).toHaveLength(1);
    expect(json.data.pendingClaim).toBeDefined();
    expect(json.data.pendingClaim.id).toBe('clm-1');
  });
});
