import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getStaff, POST as createStaff } from '@/app/api/admin/staff/route';
import { PATCH as updateStaff } from '@/app/api/admin/staff/[id]/route';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

// Mocks
const mockAdminFrom = vi.fn();
const mockListUsers = vi.fn();
const mockCreateUser = vi.fn();
const mockInviteUser = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    auth: {
      admin: {
        listUsers: mockListUsers,
        createUser: mockCreateUser,
        inviteUserByEmail: mockInviteUser,
        deleteUser: mockDeleteUser,
      },
    },
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));

describe('Admin Staff Management API Tests (GAP-02 / NFR-03)', () => {
  const adminContext: guards.UserAuthContext = {
    userId: 'usr-admin-1',
    email: 'admin.utama@unimed.ac.id',
    role: 'ADMIN',
    staffProfile: {
      id: 'stf-admin-1',
      name: 'Admin Utama TU',
      role: 'ADMIN',
      isActive: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guards, 'requireAdmin').mockResolvedValue(adminContext);
  });

  describe('1. Role Authorization & Authentication Guards', () => {
    it('menolak akses pengguna tidak terotentikasi (401 UNAUTHORIZED)', async () => {
      vi.spyOn(guards, 'requireAdmin').mockRejectedValueOnce(
        new guards.AuthError('Sesi tidak ditemukan atau telah kedaluwarsa.', 401, 'UNAUTHORIZED')
      );

      const res = await getStaff();
      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('menolak akses peran STAFF biasa dengan 403 FORBIDDEN_ADMIN_ONLY', async () => {
      vi.spyOn(guards, 'requireAdmin').mockRejectedValueOnce(
        new guards.AuthError('Operasi ini hanya diizinkan untuk peran Administrator.', 403, 'FORBIDDEN_ADMIN_ONLY')
      );

      const res = await getStaff();
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN_ADMIN_ONLY');
    });

    it('menolak akses peran Mahasiswa dengan 403 FORBIDDEN_ADMIN_ONLY', async () => {
      vi.spyOn(guards, 'requireAdmin').mockRejectedValueOnce(
        new guards.AuthError('Operasi ini hanya diizinkan untuk peran Administrator.', 403, 'FORBIDDEN_ADMIN_ONLY')
      );

      const req = new Request('http://localhost/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Budi', email: 'budi@unimed.ac.id' }),
      });

      const res = await createStaff(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN_ADMIN_ONLY');
    });
  });

  describe('2. GET /api/admin/staff (Daftar Staf)', () => {
    it('mengembalikan daftar staf lengkap beserta email dan peran saat dipanggil oleh ADMIN', async () => {
      const mockProfiles = [
        {
          id: 'stf-admin-1',
          auth_user_id: 'usr-admin-1',
          name: 'Admin Utama TU',
          role: 'ADMIN',
          is_active: true,
          created_at: '2026-11-01T08:00:00Z',
          updated_at: '2026-11-01T08:00:00Z',
        },
        {
          id: 'stf-2',
          auth_user_id: 'usr-staff-2',
          name: 'Petugas Joko',
          role: 'STAFF',
          is_active: true,
          created_at: '2026-11-05T09:00:00Z',
          updated_at: '2026-11-05T09:00:00Z',
        },
      ];

      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValueOnce({ data: mockProfiles, error: null }),
      }));

      mockListUsers.mockResolvedValueOnce({
        data: {
          users: [
            { id: 'usr-admin-1', email: 'admin.utama@unimed.ac.id', last_sign_in_at: '2026-11-22T08:00:00Z' },
            { id: 'usr-staff-2', email: 'joko.tu@unimed.ac.id', last_sign_in_at: null },
          ],
        },
        error: null,
      });

      const res = await getStaff();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(json.data[0].email).toBe('admin.utama@unimed.ac.id');
      expect(json.data[1].email).toBe('joko.tu@unimed.ac.id');
      expect(json.data[1].role).toBe('STAFF');
    });
  });

  describe('3. POST /api/admin/staff (Tambah & Undang Staf)', () => {
    it('menolak input tidak valid (nama kosong / format email salah)', async () => {
      const req = new Request('http://localhost/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          email: 'bukan-email',
        }),
      });

      const res = await createStaff(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('menolak email jika sudah terdaftar sebagai mahasiswa (NFR-03: pemisahan peran)', async () => {
      // 1. Mock query students table -> returns existing student
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: { id: 'std-1', name: 'Mahasiswa Budi' },
          error: null,
        }),
      }));

      const req = new Request('http://localhost/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Budi Santoso',
          email: 'budi.mhs@unimed.ac.id',
          role: 'STAFF',
          password: 'password123',
        }),
      });

      const res = await createStaff(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('EMAIL_REGISTERED_AS_STUDENT');
    });

    it('menolak jika email sudah terdaftar sebagai akun staf/admin (409 DUPLICATE_STAFF_EMAIL)', async () => {
      // 1. Mock query students -> null
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      }));

      // 2. Mock auth listUsers -> user exists
      mockListUsers.mockResolvedValueOnce({
        data: {
          users: [{ id: 'usr-existing-staff', email: 'existing.tu@unimed.ac.id' }],
        },
      });

      // 3. Mock query staff_profiles -> profile exists
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: { id: 'stf-existing' },
          error: null,
        }),
      }));

      const req = new Request('http://localhost/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Existing Staff',
          email: 'existing.tu@unimed.ac.id',
          role: 'STAFF',
          password: 'password123',
        }),
      });

      const res = await createStaff(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe('DUPLICATE_STAFF_EMAIL');
    });

    it('berhasil membuat akun staf dengan kata sandi awal (201 Created)', async () => {
      // 1. Mock query students -> null
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      }));

      // 2. Mock auth listUsers -> empty
      mockListUsers.mockResolvedValueOnce({ data: { users: [] } });

      // 3. Mock createUser
      mockCreateUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-new-staff', email: 'new.tu@unimed.ac.id' } },
        error: null,
      });

      // 4. Mock insert staff_profiles
      mockAdminFrom.mockImplementationOnce(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-new',
            auth_user_id: 'usr-new-staff',
            name: 'Petugas Baru',
            role: 'STAFF',
            is_active: true,
            created_at: '2026-11-22T10:00:00Z',
            updated_at: '2026-11-22T10:00:00Z',
          },
          error: null,
        }),
      }));

      const req = new Request('http://localhost/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Petugas Baru',
          email: 'new.tu@unimed.ac.id',
          role: 'STAFF',
          password: 'securePassword123',
        }),
      });

      const res = await createStaff(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Petugas Baru');
      expect(json.data.email).toBe('new.tu@unimed.ac.id');
      expect(audit.recordAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'STAFF_CREATED',
          entityType: 'staff_profiles',
        })
      );
    });

    it('melakukan rollback (deleteUser) jika insert profil staf gagal', async () => {
      // 1. Mock query students -> null
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      }));

      mockListUsers.mockResolvedValueOnce({ data: { users: [] } });

      // 2. Mock createUser -> success
      mockCreateUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-temp', email: 'fail.tu@unimed.ac.id' } },
        error: null,
      });

      // 3. Mock insert staff_profiles -> database error
      mockAdminFrom.mockImplementationOnce(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: null,
          error: { message: 'Database connection error' },
        }),
      }));

      mockDeleteUser.mockResolvedValueOnce({ data: null, error: null });

      const req = new Request('http://localhost/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Petugas Gagal',
          email: 'fail.tu@unimed.ac.id',
          password: 'securePassword123',
        }),
      });

      const res = await createStaff(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error.code).toBe('PROFILE_CREATION_FAILED');
      expect(mockDeleteUser).toHaveBeenCalledWith('usr-temp');
    });
  });

  describe('4. PATCH /api/admin/staff/[id] (Aktivasi, Deaktivasi, & Keamanan)', () => {
    it('menolak request jika format UUID id tidak valid', async () => {
      const req = new Request('http://localhost/api/admin/staff/invalid-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });

      const res = await updateStaff(req, {
        params: Promise.resolve({ id: 'invalid-id' }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('INVALID_ID');
    });

    it('menolak perubahan jika staf target tidak ditemukan (404)', async () => {
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      }));

      const req = new Request('http://localhost/api/admin/staff/11111111-1111-4111-a111-111111111111', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });

      const res = await updateStaff(req, {
        params: Promise.resolve({ id: '11111111-1111-4111-a111-111111111111' }),
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error.code).toBe('STAFF_NOT_FOUND');
    });

    it('MENCEGAH Admin menonaktifkan dirinya sendiri (400 CANNOT_DEACTIVATE_SELF)', async () => {
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-admin-1', // ID admin yang sedang login
            auth_user_id: 'usr-admin-1',
            name: 'Admin Utama TU',
            role: 'ADMIN',
            is_active: true,
          },
          error: null,
        }),
      }));

      const req = new Request('http://localhost/api/admin/staff/11111111-1111-4111-a111-111111111111', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });

      const res = await updateStaff(req, {
        params: Promise.resolve({ id: '11111111-1111-4111-a111-111111111111' }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('CANNOT_DEACTIVATE_SELF');
    });

    it('MENCEGAH perubahan peran dari/ke ADMIN via endpoint staff biasa (400 ROLE_CHANGE_FORBIDDEN)', async () => {
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-target-staff',
            auth_user_id: 'usr-staff-x',
            name: 'Petugas Biasa',
            role: 'STAFF',
            is_active: true,
          },
          error: null,
        }),
      }));

      const req = new Request('http://localhost/api/admin/staff/22222222-2222-4222-a222-222222222222', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ADMIN' }), // Coba naikkan ke ADMIN
      });

      const res = await updateStaff(req, {
        params: Promise.resolve({ id: '22222222-2222-4222-a222-222222222222' }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('ROLE_CHANGE_FORBIDDEN');
    });

    it('berhasil menonaktifkan staf lain dan mencatat STAFF_DEACTIVATED ke audit log', async () => {
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-other',
            auth_user_id: 'usr-other',
            name: 'Staf Lain',
            role: 'STAFF',
            is_active: true,
          },
          error: null,
        }),
      }));

      // Update mock
      mockAdminFrom.mockImplementationOnce(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-other',
            auth_user_id: 'usr-other',
            name: 'Staf Lain',
            role: 'STAFF',
            is_active: false,
            created_at: '2026-11-01T00:00:00Z',
            updated_at: '2026-11-22T10:00:00Z',
          },
          error: null,
        }),
      }));

      const req = new Request('http://localhost/api/admin/staff/22222222-2222-4222-a222-222222222222', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });

      const res = await updateStaff(req, {
        params: Promise.resolve({ id: '22222222-2222-4222-a222-222222222222' }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.is_active).toBe(false);
      expect(audit.recordAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'STAFF_DEACTIVATED',
          entityType: 'staff_profiles',
        })
      );
    });

    it('berhasil mengaktifkan kembali staf nonaktif dan mencatat STAFF_ACTIVATED ke audit log', async () => {
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-inactive',
            auth_user_id: 'usr-inactive',
            name: 'Staf Nonaktif',
            role: 'STAFF',
            is_active: false,
          },
          error: null,
        }),
      }));

      // Update mock
      mockAdminFrom.mockImplementationOnce(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-inactive',
            auth_user_id: 'usr-inactive',
            name: 'Staf Nonaktif',
            role: 'STAFF',
            is_active: true,
            created_at: '2026-11-01T00:00:00Z',
            updated_at: '2026-11-22T10:00:00Z',
          },
          error: null,
        }),
      }));

      const req = new Request('http://localhost/api/admin/staff/33333333-3333-4333-a333-333333333333', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });

      const res = await updateStaff(req, {
        params: Promise.resolve({ id: '33333333-3333-4333-a333-333333333333' }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.is_active).toBe(true);
      expect(audit.recordAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'STAFF_ACTIVATED',
          entityType: 'staff_profiles',
        })
      );
    });
  });
});
