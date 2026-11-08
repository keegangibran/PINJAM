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
    },
  })),
}));

describe('Auth Login Status Synchronization Unit Tests (POST /api/auth/login)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    email: 'keegan.student@mhs.unimed.ac.id',
    password: 'password123',
  };

  it('synchronizes status to PENDING_DOCUMENT when student email is confirmed in Auth but status is UNVERIFIED_EMAIL', async () => {
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
    expect(data.redirectTo).toBe('/register');

    // Verifikasi bahwa update ke students dipanggil dengan benar
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        registration_status: 'PENDING_DOCUMENT',
        updated_at: expect.any(String),
      })
    );
    expect(mockEq).toHaveBeenCalledWith('id', studentDbId);
  });

  it('does NOT update status if student is already in PENDING_DOCUMENT status', async () => {
    const authUserId = 'usr-student-already-pending';
    const studentDbId = 'std-uuid-already-pending';

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

    // 3. Mock students query: student already has PENDING_DOCUMENT
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

    // Pastikan tidak ada query update tambahan ke adminClient (hanya 2 query: staff check & student select)
    expect(mockAdminFrom).toHaveBeenCalledTimes(2);
  });

  it('does NOT update status if student email is NOT confirmed in Auth', async () => {
    const authUserId = 'usr-student-unconfirmed';
    const studentDbId = 'std-uuid-unconfirmed';

    // 1. Mock signInWithPassword: email NOT confirmed (email_confirmed_at is null)
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

    // 2. Mock staff_profiles check: not staff
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Not staff' },
      }),
    });

    // 3. Mock students query: student has UNVERIFIED_EMAIL
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

    // Pastikan tidak ada update ke students (hanya staff check & student select)
    expect(mockAdminFrom).toHaveBeenCalledTimes(2);
  });

  it('returns HTTP 500 STATUS_UPDATE_FAILED when database update fails during synchronization', async () => {
    const authUserId = 'usr-student-fail';
    const studentDbId = 'std-uuid-fail';

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

    // 3. Mock students query: student has UNVERIFIED_EMAIL
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

    // 4. Mock students update FAILING
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

