import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as handleLogout } from '@/app/api/auth/logout/route';

const mockSignOut = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signOut: mockSignOut,
    },
  })),
}));

describe('Auth Logout API Unit Tests (POST /api/auth/logout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully logs out and clears Supabase session', async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });

    const res = await handleLogout();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Berhasil keluar.');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('returns HTTP 500 LOGOUT_ERROR when signOut throws an error', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('Network failure during sign out'));

    const res = await handleLogout();
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error.code).toBe('LOGOUT_ERROR');
    expect(data.error.message).toBe('Gagal memproses keluar akun.');
  });
});

