import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as handleLogin } from '@/app/api/auth/login/route';
import { POST as registerStudent } from '@/app/api/students/profile/route';
import {
  isPathAllowedForRole,
  getRoleSafeRedirectDestination,
  getDefaultRedirectForRole,
  matchesStrictSegment,
} from '@/lib/auth/redirect';

// Mocks
const mockAdminFrom = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockGetUser = vi.fn();
const mockSignUp = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getUser: mockGetUser,
      signUp: mockSignUp,
    },
  })),
}));

describe('Universal Login Backend & Orphan Registration Test Suite (Phase 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseOrigin = 'http://localhost:3000';

  describe('Part 1: Strict Segment Matching & Role-Aware ReturnUrl Logic', () => {
    // Skenario 1: ADMIN default
    it('1. ADMIN tanpa returnUrl diarahkan ke /admin', () => {
      expect(getDefaultRedirectForRole('ADMIN')).toBe('/admin');
      const dest = getRoleSafeRedirectDestination(null, 'ADMIN', baseOrigin);
      expect(dest).toBe('/admin');
    });

    // Skenario 2: STAFF default
    it('2. STAFF tanpa returnUrl diarahkan ke /kiosk', () => {
      expect(getDefaultRedirectForRole('STAFF')).toBe('/kiosk');
      const dest = getRoleSafeRedirectDestination(null, 'STAFF', baseOrigin);
      expect(dest).toBe('/kiosk');
    });

    // Skenario 3: STUDENT default
    it('3. STUDENT tanpa returnUrl diarahkan ke /my-qr', () => {
      expect(getDefaultRedirectForRole('STUDENT')).toBe('/my-qr');
      const dest = getRoleSafeRedirectDestination(null, 'STUDENT', baseOrigin);
      expect(dest).toBe('/my-qr');
    });

    // Skenario 4: Orphan default
    it('4. Orphan tanpa returnUrl diarahkan ke /register', () => {
      expect(getDefaultRedirectForRole('ORPHAN')).toBe('/register');
      const dest = getRoleSafeRedirectDestination(null, 'ORPHAN', baseOrigin);
      expect(dest).toBe('/register');
    });

    // Skenario 5: STAFF tidak dapat menggunakan returnUrl yang tidak diizinkan
    it('5. STAFF tidak dapat menggunakan returnUrl yang tidak diizinkan (misal /admin/classes atau /my-qr)', () => {
      expect(isPathAllowedForRole('/admin/classes', 'STAFF')).toBe(false);
      expect(isPathAllowedForRole('/my-qr', 'STAFF')).toBe(false);

      const destClasses = getRoleSafeRedirectDestination('/admin/classes', 'STAFF', baseOrigin);
      expect(destClasses).toBe('/kiosk');

      const destMyQr = getRoleSafeRedirectDestination('/my-qr', 'STAFF', baseOrigin);
      expect(destMyQr).toBe('/kiosk');
    });

    // Skenario 6: STUDENT tidak dapat menggunakan /admin
    it('6. STUDENT tidak dapat diarahkan ke /admin atau subpath admin', () => {
      expect(isPathAllowedForRole('/admin', 'STUDENT')).toBe(false);
      expect(isPathAllowedForRole('/admin/projectors', 'STUDENT')).toBe(false);

      const dest = getRoleSafeRedirectDestination('/admin', 'STUDENT', baseOrigin);
      expect(dest).toBe('/my-qr');
    });

    // Skenario 7: STUDENT tidak dapat menggunakan /kiosk
    it('7. STUDENT tidak dapat diarahkan ke /kiosk atau subpath kiosk', () => {
      expect(isPathAllowedForRole('/kiosk', 'STUDENT')).toBe(false);
      expect(isPathAllowedForRole('/kiosk/unit', 'STUDENT')).toBe(false);

      const dest = getRoleSafeRedirectDestination('/kiosk', 'STUDENT', baseOrigin);
      expect(dest).toBe('/my-qr');
    });

    // Skenario 8: /admin-evil ditolak oleh strict segment matching
    it('8. /admin-evil ditolak oleh strict segment matching untuk semua role', () => {
      expect(matchesStrictSegment('/admin-evil', '/admin')).toBe(false);
      expect(isPathAllowedForRole('/admin-evil', 'ADMIN')).toBe(false);
      expect(isPathAllowedForRole('/admin-evil', 'STAFF')).toBe(false);

      const dest = getRoleSafeRedirectDestination('/admin-evil', 'ADMIN', baseOrigin);
      expect(dest).toBe('/admin');
    });

    // Skenario 9: /kiosk-malicious ditolak oleh strict segment matching
    it('9. /kiosk-malicious ditolak oleh strict segment matching untuk semua role', () => {
      expect(matchesStrictSegment('/kiosk-malicious', '/kiosk')).toBe(false);
      expect(isPathAllowedForRole('/kiosk-malicious', 'STAFF')).toBe(false);
      expect(isPathAllowedForRole('/kiosk-malicious', 'ADMIN')).toBe(false);

      const dest = getRoleSafeRedirectDestination('/kiosk-malicious', 'STAFF', baseOrigin);
      expect(dest).toBe('/kiosk');
    });

    // Skenario 10: External URL ditolak
    it('10. External URL dan open-redirect ditolak dan fallback ke default role', () => {
      const destAdmin = getRoleSafeRedirectDestination('https://evil.com/steal', 'ADMIN', baseOrigin);
      expect(destAdmin).toBe('/admin');

      const destStaff = getRoleSafeRedirectDestination('//evil.com/phish', 'STAFF', baseOrigin);
      expect(destStaff).toBe('/kiosk');

      const destStudent = getRoleSafeRedirectDestination('/\\evil.com', 'STUDENT', baseOrigin);
      expect(destStudent).toBe('/my-qr');
    });

    // Skenario 11: Query string aman tetap dipertahankan
    it('11. Query string aman tetap dipertahankan hanya jika path lolos validasi peran', () => {
      const validAdmin = getRoleSafeRedirectDestination(
        '/admin/projectors?status=AVAILABLE#top',
        'ADMIN',
        baseOrigin
      );
      expect(validAdmin).toBe('/admin/projectors?status=AVAILABLE#top');

      const validKiosk = getRoleSafeRedirectDestination(
        '/kiosk?session=abc123',
        'STAFF',
        baseOrigin
      );
      expect(validKiosk).toBe('/kiosk?session=abc123');

      // Jika path ditolak, query string dibuang dan fallback ke default bersih
      const invalidPath = getRoleSafeRedirectDestination(
        '/admin-evil?steal=credentials#secret',
        'ADMIN',
        baseOrigin
      );
      expect(invalidPath).toBe('/admin');
    });

    it('menolak /login-history dan rute /login untuk mencegah loop redirect', () => {
      expect(isPathAllowedForRole('/login-history', 'ADMIN')).toBe(false);
      expect(isPathAllowedForRole('/login-history', 'STAFF')).toBe(false);
      expect(isPathAllowedForRole('/login-history', 'STUDENT')).toBe(false);
      expect(isPathAllowedForRole('/login', 'ADMIN')).toBe(false);
      expect(isPathAllowedForRole('/login', 'STUDENT')).toBe(false);

      const dest = getRoleSafeRedirectDestination('/login-history', 'ADMIN', baseOrigin);
      expect(dest).toBe('/admin');
    });
  });

  describe('Part 2: POST /api/auth/login Endpoint Role Resolution', () => {
    const credentials = {
      email: 'user@unimed.ac.id',
      password: 'password123',
    };

    // Skenario 12: Akun STAFF nonaktif ditolak
    it('12. Akun STAFF nonaktif ditolak dengan HTTP 403 ACCOUNT_DISABLED dan dipaksa signOut', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: 'usr-inactive-staff', email: credentials.email },
        },
        error: null,
      });

      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-inactive',
            name: 'Staff Nonaktif',
            role: 'STAFF',
            is_active: false,
          },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      const res = await handleLogin(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error.code).toBe('ACCOUNT_DISABLED');
      expect(mockSignOut).toHaveBeenCalled();
    });

    it('mengalihkan ADMIN ke /admin jika tanpa returnUrl dan ke returnUrl jika sah', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: 'usr-admin-1', email: credentials.email },
        },
        error: null,
      });

      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-admin-1',
            name: 'Administrator Utama',
            role: 'ADMIN',
            is_active: true,
          },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      const res = await handleLogin(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.role).toBe('ADMIN');
      expect(data.redirectTo).toBe('/admin');
    });

    it('mengalihkan STAFF ke /kiosk secara default', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: 'usr-staff-1', email: credentials.email },
        },
        error: null,
      });

      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-staff-1',
            name: 'Petugas Kiosk',
            role: 'STAFF',
            is_active: true,
          },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      const res = await handleLogin(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.role).toBe('STAFF');
      expect(data.redirectTo).toBe('/kiosk');
    });

    it('menolak returnUrl /admin/classes untuk STAFF dan mengembalikannya ke /kiosk', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: 'usr-staff-2', email: credentials.email },
        },
        error: null,
      });

      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'stf-staff-2',
            name: 'Petugas Kiosk 2',
            role: 'STAFF',
            is_active: true,
          },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credentials,
          returnUrl: '/admin/classes',
        }),
      });

      const res = await handleLogin(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.redirectTo).toBe('/kiosk');
    });

    it('menolak returnUrl /admin untuk STUDENT dan mengembalikannya ke /my-qr', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: 'usr-student-qr', email: credentials.email },
        },
        error: null,
      });

      // staff query: not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: null,
          error: { message: 'Not staff' },
        }),
      });

      // student query: active student
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'std-qr-1',
            name: 'Mahasiswa Test',
            registration_status: 'ACTIVE',
          },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credentials,
          returnUrl: '/admin',
        }),
      });

      const res = await handleLogin(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.redirectTo).toBe('/my-qr');
    });
  });

  describe('Part 3: Orphan & Normal Student Registration (POST /api/students/profile)', () => {
    const registrationPayload = {
      name: 'Rian Perdana',
      nim: '4223121099',
      email: 'rian.perdana@unimed.ac.id',
      password: 'password123',
      class_id: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
      consent: true,
    };

    // Skenario 13: Orphan yang sudah login dapat melanjutkan pembuatan profil
    it('13. Orphan yang sudah login dapat melanjutkan pembuatan profil tanpa signUp() ulang', async () => {
      const orphanUserId = 'usr-orphan-active-session';
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: orphanUserId,
            email: registrationPayload.email,
            email_confirmed_at: '2026-11-09T08:00:00.000Z',
          },
        },
        error: null,
      });

      // 1. Check existing student by auth_user_id -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 2. Check existing staff by auth_user_id -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 3. Check class validity -> active
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: registrationPayload.class_id,
            study_program: 'Ilmu Komputer',
            cohort_year: 2025,
            section: 'A',
            academic_term: '2026/2027-GANJIL',
            is_active: true,
            leader_student_id: null,
          },
          error: null,
        }),
      });

      // 4. Check NIM active -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 5. Insert student
      const studentId = 'std-new-orphan-profile';
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: studentId,
            auth_user_id: orphanUserId,
            nim: registrationPayload.nim,
            name: registrationPayload.name,
            registration_status: 'PENDING_DOCUMENT',
          },
          error: null,
        }),
      });

      // 6. Check existing claims
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 7. Insert claim
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'claim-orphan-1',
            class_id: registrationPayload.class_id,
            student_id: studentId,
            claim_type: 'INITIAL',
            status: 'PENDING',
          },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.student_id).toBe(studentId);
      expect(data.data.status).toBe('PENDING_DOCUMENT');

      // signUp TIDAK boleh dipanggil sama sekali karena sesi sudah ada!
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    // Skenario 14: Pengguna tanpa sesi tetap dapat mendaftar melalui jalur normal
    it('14. Pengguna tanpa sesi tetap dapat mendaftar melalui jalur normal menggunakan signUp()', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      // 1. Check class validity -> active
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: registrationPayload.class_id,
            study_program: 'Ilmu Komputer',
            cohort_year: 2025,
            section: 'A',
            academic_term: '2026/2027-GANJIL',
            is_active: true,
            leader_student_id: null,
          },
          error: null,
        }),
      });

      // 2. Check NIM active -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 3. Call signUp
      const createdAuthId = 'usr-created-fresh-signup';
      mockSignUp.mockResolvedValueOnce({
        data: {
          user: {
            id: createdAuthId,
            email: registrationPayload.email,
            identities: [{ id: 'identity-fresh' }],
            email_confirmed_at: null,
          },
        },
        error: null,
      });

      // 4. Insert student
      const studentId = 'std-new-fresh-profile';
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: studentId,
            auth_user_id: createdAuthId,
            nim: registrationPayload.nim,
            name: registrationPayload.name,
            registration_status: 'UNVERIFIED_EMAIL',
          },
          error: null,
        }),
      });

      // 5. Check claims
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 6. Insert claim
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'claim-fresh-1',
            class_id: registrationPayload.class_id,
            student_id: studentId,
            claim_type: 'INITIAL',
            status: 'PENDING',
          },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registrationPayload.email,
          password: registrationPayload.password,
        })
      );
    });

    // Skenario 15: NIM duplikat tetap ditolak
    it('15. NIM yang sudah aktif tetap ditolak dengan HTTP 409 NIM_ALREADY_ACTIVE', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      // 1. Check class validity -> active
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: registrationPayload.class_id,
            is_active: true,
          },
          error: null,
        }),
      });

      // 2. Check NIM active -> FOUND (Conflict!)
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: 'std-already-active', nim: registrationPayload.nim },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe('NIM_ALREADY_ACTIVE');
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    // Skenario 16: Akun staf tidak dapat membuat profil mahasiswa melalui jalur orphan
    it('16. Akun staf/admin yang login ditolak membuat profil mahasiswa dengan HTTP 403 STAFF_CANNOT_BE_STUDENT', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'usr-staff-id-attacker',
            email: registrationPayload.email,
          },
        },
        error: null,
      });

      // 1. Check existing student -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 2. Check existing staff -> FOUND!
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: { id: 'stf-profile-active', role: 'STAFF' },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error.code).toBe('STAFF_CANNOT_BE_STUDENT');
    });

    // Skenario 17: Tidak ada profil duplikat
    it('17. Pengguna yang sudah memiliki profil mahasiswa ditolak dengan HTTP 409 PROFILE_ALREADY_EXISTS', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'usr-already-has-profile',
            email: registrationPayload.email,
          },
        },
        error: null,
      });

      // 1. Check existing student -> FOUND!
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: { id: 'std-existing-id' },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe('PROFILE_ALREADY_EXISTS');
    });

    it('menolak registrasi jalur orphan jika email di payload berbeda dengan email akun Auth aktif', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'usr-orphan-mismatch',
            email: 'original.email@unimed.ac.id',
          },
        },
        error: null,
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...registrationPayload,
          email: 'different.email@unimed.ac.id',
        }),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('EMAIL_MISMATCH');
    });

    it('berhasil membuat profil dengan status UNVERIFIED_EMAIL untuk akun orphan dengan email_confirmed_at: null', async () => {
      const orphanUserId = 'usr-orphan-unconfirmed-email';
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: orphanUserId,
            email: registrationPayload.email,
            email_confirmed_at: null, // Email belum terkonfirmasi
          },
        },
        error: null,
      });

      // 1. Check existing student -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 2. Check existing staff -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 3. Check class validity -> active
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: registrationPayload.class_id,
            study_program: 'Ilmu Komputer',
            cohort_year: 2025,
            section: 'A',
            academic_term: '2026/2027-GANJIL',
            is_active: true,
            leader_student_id: null,
          },
          error: null,
        }),
      });

      // 4. Check NIM active -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 5. Insert student with UNVERIFIED_EMAIL status
      const studentId = 'std-orphan-unverified-id';
      const mockInsert = vi.fn().mockReturnThis();
      mockAdminFrom.mockReturnValueOnce({
        insert: mockInsert,
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: studentId,
            auth_user_id: orphanUserId,
            nim: registrationPayload.nim,
            name: registrationPayload.name,
            registration_status: 'UNVERIFIED_EMAIL',
          },
          error: null,
        }),
      });

      // 6. Check existing claims
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 7. Insert claim
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'claim-orphan-unverified',
            class_id: registrationPayload.class_id,
            student_id: studentId,
            claim_type: 'INITIAL',
            status: 'PENDING',
          },
          error: null,
        }),
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.student_id).toBe(studentId);
      expect(data.data.status).toBe('UNVERIFIED_EMAIL');
      expect(data.data.claim_type).toBe('INITIAL');
      expect(data.data.is_email_confirmed).toBe(false);

      // Verifikasi bahwa insert student menerima auth_user_id dari sesi server dan status UNVERIFIED_EMAIL
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          auth_user_id: orphanUserId,
          registration_status: 'UNVERIFIED_EMAIL',
        })
      );

      // Pastikan signUp() TIDAK pernah dipanggil pada alur orphan
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('memetakan PostgreSQL 23505 pada auth_user_id ke HTTP 409 PROFILE_ALREADY_EXISTS saat race condition', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'usr-orphan-race-condition',
            email: registrationPayload.email,
            email_confirmed_at: '2026-11-09T08:00:00.000Z',
          },
        },
        error: null,
      });

      // 1. Check existing student -> not found initially
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 2. Check existing staff -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 3. Check class validity -> active
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: registrationPayload.class_id, is_active: true },
          error: null,
        }),
      });

      // 4. Check NIM active -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 5. Insert student -> BENTURAN UNIQUE CONSTRAINT 23505 pada auth_user_id
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "students_auth_user_id_key"',
            details: 'Key (auth_user_id)=(usr-orphan-race-condition) already exists.',
          },
        }),
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe('PROFILE_ALREADY_EXISTS');
      expect(data.error.message).toContain('sudah memiliki profil');
    });

    it('memetakan PostgreSQL 23505 pada NIM constraint ke HTTP 409 NIM_ALREADY_ACTIVE bukan PROFILE_ALREADY_EXISTS', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'usr-orphan-nim-race',
            email: registrationPayload.email,
            email_confirmed_at: '2026-11-09T08:00:00.000Z',
          },
        },
        error: null,
      });

      // 1. Check existing student -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 2. Check existing staff -> not found
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 3. Check class validity -> active
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: registrationPayload.class_id, is_active: true },
          error: null,
        }),
      });

      // 4. Check NIM active -> not found during select
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // 5. Insert student -> BENTURAN UNIQUE INDEX 23505 pada idx_students_active_nim
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "idx_students_active_nim"',
            details: 'Key (nim)=(4223121099) already exists.',
          },
        }),
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe('NIM_ALREADY_ACTIVE');
      expect(data.error.message).toContain('NIM ini telah terdaftar');
    });

    it('memetakan PostgreSQL 23505 constraint lainnya ke HTTP 409 DUPLICATE_DATA', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'usr-orphan-other-unique',
            email: registrationPayload.email,
            email_confirmed_at: '2026-11-09T08:00:00.000Z',
          },
        },
        error: null,
      });

      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: registrationPayload.class_id, is_active: true },
          error: null,
        }),
      });
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // Insert student -> generic unique collision
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "uq_custom_constraint"',
          },
        }),
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe('DUPLICATE_DATA');
    });

    it('menangani error database umum selain 23505 dengan HTTP 500 aman tanpa membocorkan internal database', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'usr-orphan-db-failure',
            email: registrationPayload.email,
            email_confirmed_at: '2026-11-09T08:00:00.000Z',
          },
        },
        error: null,
      });

      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: registrationPayload.class_id, is_active: true },
          error: null,
        }),
      });
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // Insert student -> Error koneksi basis data (code 08006 / 57014)
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: null,
          error: {
            code: '08006',
            message: 'connection_failure: server closed the connection unexpectedly at host pg-primary.internal',
          },
        }),
      });

      const req = new Request('http://localhost/api/students/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload),
      });

      const res = await registerStudent(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error.code).toBe('STUDENT_PROFILE_FAILED');
      // Pesan error aman dan tidak membocorkan detail server 'pg-primary.internal'
      expect(data.error.message).toBe('Gagal membuat profil mahasiswa. Terjadi kesalahan pada sistem basis data.');
      expect(data.error.message).not.toContain('pg-primary.internal');
    });
  });
});
