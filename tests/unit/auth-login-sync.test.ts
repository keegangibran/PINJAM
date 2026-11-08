import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as handleLogin } from '@/app/api/auth/login/route';

// Mocks
const mockAdminFrom = vi.fn();
const mockSignInWithPassword = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}));

describe('Auth Login Status & Redirection Unit Tests (POST /api/auth/login)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    email: 'keegan.student@mhs.unimed.ac.id',
    password: 'password123',
  };

  it('synchronizes status to PENDING_DOCUMENT and redirects to /my-qr when email is confirmed in Auth but UNVERIFIED_EMAIL in DB', async () => {
    const authUserId = 'usr-student-123';
    const studentDbId = 'std-uuid-456';

    // 1. Mock signInWithPassword: email confirmed
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: {
          id: authUserId,
          email: validPayload.email,
          email_confirmed_at: '2026-11-08T06:35:12.000Z',
        },
      },
      error: null,
    });

    // 2. Mock staff_profiles check: not staff
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not staff' },
      }),
    });

    // 3. Mock students query: student exists with UNVERIFIED_EMAIL
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: studentDbId,
          name: 'Keegan Gibran',
          registration_status: 'UNVERIFIED_EMAIL',
        },
        error: null,
      }),
    });

    // 4. Mock students update to PENDING_DOCUMENT
    const mockEq = vi.fn().mockResolvedValueOnce({ error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    mockAdminFrom.mockReturnValueOnce({
      update: mockUpdate,
    });

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await handleLogin(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.role).toBe('STUDENT');
    expect(data.name).toBe('Keegan Gibran');
    expect(data.status).toBe('PENDING_DOCUMENT');
    expect(data.redirectTo).toBe('/my-qr');

    // Verifikasi bahwa update ke students dipanggil dengan benar
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        registration_status: 'PENDING_DOCUMENT',
        updated_at: expect.any(String),
      })
    );
    expect(mockEq).toHaveBeenCalledWith('id', studentDbId);
  });

  it('redirects to /my-qr for student already in PENDING_DOCUMENT status without invoking update', async () => {
    const authUserId = 'usr-student-pending';
    const studentDbId = 'std-uuid-pending';

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: {
          id: authUserId,
          email: validPayload.email,
          email_confirmed_at: '2026-11-08T06:35:12.000Z',
        },
      },
      error: null,
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not staff' },
      }),
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: studentDbId,
          name: 'Keegan Gibran',
          registration_status: 'PENDING_DOCUMENT',
        },
        error: null,
      }),
    });

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await handleLogin(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe('PENDING_DOCUMENT');
    expect(data.redirectTo).toBe('/my-qr');

    expect(mockAdminFrom).toHaveBeenCalledTimes(2);
  });

  it('redirects to /my-qr for student with ACTIVE status', async () => {
    const authUserId = 'usr-student-active';
    const studentDbId = 'std-uuid-active';

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: {
          id: authUserId,
          email: validPayload.email,
          email_confirmed_at: '2026-11-08T06:35:12.000Z',
        },
      },
      error: null,
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not staff' },
      }),
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: studentDbId,
          name: 'Budi Leader',
          registration_status: 'ACTIVE',
        },
        error: null,
      }),
    });

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await handleLogin(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe('ACTIVE');
    expect(data.redirectTo).toBe('/my-qr');
  });

  it('redirects to /my-qr for other existing student statuses (e.g. PENDING_REVIEW)', async () => {
    const authUserId = 'usr-student-review';
    const studentDbId = 'std-uuid-review';

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: {
          id: authUserId,
          email: validPayload.email,
          email_confirmed_at: '2026-11-08T06:35:12.000Z',
        },
      },
      error: null,
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not staff' },
      }),
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: studentDbId,
          name: 'Siti Review',
          registration_status: 'PENDING_REVIEW',
        },
        error: null,
      }),
    });

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await handleLogin(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe('PENDING_REVIEW');
    expect(data.redirectTo).toBe('/my-qr');
  });

  it('redirects to /my-qr if email is not yet confirmed in Auth but student profile exists', async () => {
    const authUserId = 'usr-student-unconfirmed';
    const studentDbId = 'std-uuid-unconfirmed';

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: {
          id: authUserId,
          email: validPayload.email,
          email_confirmed_at: null,
        },
      },
      error: null,
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not staff' },
      }),
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: studentDbId,
          name: 'Keegan Gibran',
          registration_status: 'UNVERIFIED_EMAIL',
        },
        error: null,
      }),
    });

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await handleLogin(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe('UNVERIFIED_EMAIL');
    expect(data.redirectTo).toBe('/my-qr');

    expect(mockAdminFrom).toHaveBeenCalledTimes(2);
  });

  it('keeps admin/staff login unaffected and directs to /admin', async () => {
    const authStaffId = 'usr-staff-777';

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: {
          id: authStaffId,
          email: 'petugas@unimed.ac.id',
          email_confirmed_at: '2026-11-08T05:00:00.000Z',
        },
      },
      error: null,
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'stf-profile-1',
          name: 'Petugas TU Budi',
          role: 'ADMIN',
          is_active: true,
        },
        error: null,
      }),
    });

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'petugas@unimed.ac.id',
        password: 'adminPassword123',
      }),
    });

    const res = await handleLogin(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.role).toBe('ADMIN');
    expect(data.name).toBe('Petugas TU Budi');
    expect(data.redirectTo).toBe('/admin');

    // Hanya 1 query (staff check)
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
  });

  it('redirects to /register for user who has Auth account but NO student or staff profile in DB', async () => {
    const orphanUserId = 'usr-orphan-999';

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: {
          id: orphanUserId,
          email: 'orphan@unimed.ac.id',
          email_confirmed_at: '2026-11-08T05:00:00.000Z',
        },
      },
      error: null,
    });

    // 1. Staff check: not found
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not staff' },
      }),
    });

    // 2. Student check: not found
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not student' },
      }),
    });

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'orphan@unimed.ac.id',
        password: 'password123',
      }),
    });

    const res = await handleLogin(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.role).toBe('STUDENT');
    expect(data.redirectTo).toBe('/register');
  });

  it('returns HTTP 500 STATUS_UPDATE_FAILED when database update fails during synchronization', async () => {
    const authUserId = 'usr-student-fail';
    const studentDbId = 'std-uuid-fail';

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: {
          id: authUserId,
          email: validPayload.email,
          email_confirmed_at: '2026-11-08T06:35:12.000Z',
        },
      },
      error: null,
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not staff' },
      }),
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: studentDbId,
          name: 'Keegan Gibran',
          registration_status: 'UNVERIFIED_EMAIL',
        },
        error: null,
      }),
    });

    mockAdminFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValueOnce({
          error: { message: 'Database connection timeout' },
        }),
      }),
    });

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await handleLogin(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error.code).toBe('STATUS_UPDATE_FAILED');
    expect(data.error.message).toContain('Gagal memperbarui status');
  });
});
