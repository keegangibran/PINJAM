import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCurrentUserContext,
  requireAuth,
  requireStaff,
  requireAdmin,
  requireStudent,
  AuthError,
} from '@/lib/auth/guards';

// Mock dependencies
const mockGetUser = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

describe('Auth Guards Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentUserContext', () => {
    it('returns null if user is not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('No session') });

      const ctx = await getCurrentUserContext();
      expect(ctx).toBeNull();
    });

    it('returns STAFF context if user exists in staff_profiles with is_active = true', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-1', email: 'petugas@kampus.ac.id' } },
        error: null,
      });

      mockAdminFrom.mockImplementationOnce((table: string) => {
        expect(table).toBe('staff_profiles');
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: 'stf-1', name: 'Petugas Budi', role: 'STAFF', is_active: true },
          }),
        };
      });

      const ctx = await getCurrentUserContext();
      expect(ctx).not.toBeNull();
      expect(ctx?.role).toBe('STAFF');
      expect(ctx?.staffProfile?.name).toBe('Petugas Budi');
      expect(ctx?.staffProfile?.isActive).toBe(true);
      expect(ctx?.studentProfile).toBeNull();
    });

    it('returns STUDENT context if staff profile is inactive and student profile exists', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-2', email: 'mahasiswa@kampus.ac.id' } },
        error: null,
      });

      // 1st call for staff_profiles returns inactive or null
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: 'stf-2', name: 'Nonaktif', role: 'STAFF', is_active: false },
        }),
      }));

      // 2nd call for students returns student
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stu-1',
            nim: '12345678',
            name: 'Ali Ketua',
            registration_status: 'ACTIVE',
            current_class_id: 'cls-1',
          },
        }),
      }));

      const ctx = await getCurrentUserContext();
      expect(ctx?.role).toBe('STUDENT');
      expect(ctx?.studentProfile?.nim).toBe('12345678');
      expect(ctx?.studentProfile?.registrationStatus).toBe('ACTIVE');
    });

    it('returns unprofiled STUDENT role if neither staff nor student row found', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-3', email: 'baru@kampus.ac.id' } },
        error: null,
      });

      mockAdminFrom
        .mockImplementationOnce(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({ data: null }),
        }))
        .mockImplementationOnce(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({ data: null }),
        }));

      const ctx = await getCurrentUserContext();
      expect(ctx?.role).toBe('STUDENT');
      expect(ctx?.staffProfile).toBeNull();
      expect(ctx?.studentProfile).toBeNull();
    });
  });

  describe('requireAuth', () => {
    it('throws AuthError 401 if unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      await expect(requireAuth()).rejects.toThrow(AuthError);
    });

    it('returns context if authenticated', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-1', email: 'user@test.com' } },
        error: null,
      });
      mockAdminFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
      });

      const ctx = await requireAuth();
      expect(ctx.userId).toBe('usr-1');
    });
  });

  describe('requireStaff & requireAdmin', () => {
    it('requireStaff rejects regular student with 403', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-1', email: 'student@test.com' } },
        error: null,
      });
      mockAdminFrom
        .mockImplementationOnce(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({ data: null }),
        }))
        .mockImplementationOnce(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: 'stu-1', nim: '123', name: 'Mhs', registration_status: 'ACTIVE', current_class_id: null },
          }),
        }));

      await expect(requireStaff()).rejects.toThrow(/Akses ditolak.*Petugas TU/);
    });

    it('requireStaff succeeds for active STAFF', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-s1', email: 'staff@kampus.ac.id' } },
        error: null,
      });
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: 'stf-1', name: 'Petugas', role: 'STAFF', is_active: true },
        }),
      }));

      const ctx = await requireStaff();
      expect(ctx.role).toBe('STAFF');
    });

    it('requireAdmin rejects STAFF role with 403', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-s1', email: 'staff@kampus.ac.id' } },
        error: null,
      });
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: 'stf-1', name: 'Petugas', role: 'STAFF', is_active: true },
        }),
      }));

      await expect(requireAdmin()).rejects.toThrow(/hanya diizinkan untuk peran Administrator/);
    });

    it('requireAdmin succeeds for active ADMIN', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-a1', email: 'admin@kampus.ac.id' } },
        error: null,
      });
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: 'adm-1', name: 'Admin Utama', role: 'ADMIN', is_active: true },
        }),
      }));

      const ctx = await requireAdmin();
      expect(ctx.role).toBe('ADMIN');
    });
  });

  describe('requireStudent', () => {
    it('rejects staff from student-only actions', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-s1', email: 'staff@kampus.ac.id' } },
        error: null,
      });
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: 'stf-1', name: 'Petugas', role: 'STAFF', is_active: true },
        }),
      }));

      await expect(requireStudent()).rejects.toThrow(/Akun petugas tidak dapat melakukan tindakan mahasiswa/);
    });
  });
});

