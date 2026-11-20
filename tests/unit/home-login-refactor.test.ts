import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '@/app/page';
import LoginPage from '@/app/(auth)/login/page';
import * as guards from '@/lib/auth/guards';
import * as navigation from 'next/navigation';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
  redirect: vi.fn((url: string) => {
    const error = new Error(`NEXT_REDIRECT: ${url}`) as Error & { digest?: string };
    error.digest = `NEXT_REDIRECT;replace;${url};307;;`;
    throw error;
  }),
}));

describe('Home Page Refactor & Universal Login (src/app/page.tsx & src/app/(auth)/login/page.tsx)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('A. Route / for Unauthenticated Users', () => {
    it('1. Pengguna belum login langsung melihat Universal Login di route /', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue(null);

      const jsx = await HomePage({
        searchParams: Promise.resolve({}),
      });

      const html = renderToStaticMarkup(jsx);

      // Verifikasi Universal Login ter-render di route /
      expect(html).toContain('Masuk ke Akun');
      expect(html).toContain('Masuk dengan akun terdaftar untuk mahasiswa, petugas, atau administrator.');
      expect(html).toContain('Alamat Email');
      expect(html).toContain('Kata Sandi');
      expect(html).toContain('Masuk Akun');
      expect(html).toContain('Daftar akun di sini');
    });

    it('16. Route / tidak lagi menampilkan empat menu lama peninggalan landing page', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue(null);

      const jsx = await HomePage({
        searchParams: Promise.resolve({}),
      });

      const html = renderToStaticMarkup(jsx);

      // Menu 1: QR Pass Ketua Kelas
      expect(html).not.toContain('QR Pass Ketua Kelas');
      expect(html).not.toContain('Tampilan mobile token bertanda tangan');
      // Menu 2: Kiosk Scanner TU
      expect(html).not.toContain('Kiosk Scanner TU');
      expect(html).not.toContain('Dual-scan webcam laptop meja petugas');
      // Menu 3: Dashboard Admin & TU
      expect(html).not.toContain('Dashboard Admin &amp; TU');
      expect(html).not.toContain('Buku besar digital, inventaris, dan audit');
      // Menu 4: Masuk Akun kartu lama
      expect(html).not.toContain('Fase 1 — Fondasi');
    });

    it('17. Form login pada route / tampil dalam kartu responsif desktop & mobile', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue(null);

      const jsx = await HomePage({
        searchParams: Promise.resolve({}),
      });

      const html = renderToStaticMarkup(jsx);

      expect(html).toContain('max-w-md');
      expect(html).toContain('p-6 sm:p-8');
      expect(html).toContain('rounded-2xl');
      expect(html).toContain('bg-white');
    });
  });

  describe('B. Session Check & Role-based Redirection on Route /', () => {
    it('2. ADMIN yang sudah login diarahkan ke /admin saat membuka /', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'admin-uuid',
        email: 'admin@unimed.ac.id',
        role: 'ADMIN',
        staffProfile: {
          id: 'staff-admin-id',
          name: 'Admin Utama',
          role: 'ADMIN',
          isActive: true,
        },
        studentProfile: null,
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      await expect(
        HomePage({ searchParams: Promise.resolve({}) })
      ).rejects.toThrow('NEXT_REDIRECT: /admin');

      expect(redirectSpy).toHaveBeenCalledWith('/admin');
    });

    it('3. STAFF yang sudah login diarahkan ke /kiosk saat membuka /', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'staff-uuid',
        email: 'staff@unimed.ac.id',
        role: 'STAFF',
        staffProfile: {
          id: 'staff-petugas-id',
          name: 'Petugas TU',
          role: 'STAFF',
          isActive: true,
        },
        studentProfile: null,
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      await expect(
        HomePage({ searchParams: Promise.resolve({}) })
      ).rejects.toThrow('NEXT_REDIRECT: /kiosk');

      expect(redirectSpy).toHaveBeenCalledWith('/kiosk');
    });

    it('4. STUDENT yang sudah login diarahkan ke /my-qr saat membuka /', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'student-uuid',
        email: 'mhs@unimed.ac.id',
        role: 'STUDENT',
        staffProfile: null,
        studentProfile: {
          id: 'student-id-1',
          nim: '4253250001',
          name: 'Mahasiswa Uji',
          registrationStatus: 'ACTIVE',
          currentClassId: 'class-uuid-1',
        },
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      await expect(
        HomePage({ searchParams: Promise.resolve({}) })
      ).rejects.toThrow('NEXT_REDIRECT: /my-qr');

      expect(redirectSpy).toHaveBeenCalledWith('/my-qr');
    });

    it('5. ORPHAN (auth user tanpa profil) diarahkan ke /register saat membuka /', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'orphan-uuid',
        email: 'orphan@unimed.ac.id',
        role: 'STUDENT',
        staffProfile: null,
        studentProfile: null,
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      await expect(
        HomePage({ searchParams: Promise.resolve({}) })
      ).rejects.toThrow('NEXT_REDIRECT: /register');

      expect(redirectSpy).toHaveBeenCalledWith('/register');
    });
  });

  describe('C. Return URL Security on Route /', () => {
    it('6. ADMIN dengan returnUrl yang diizinkan diarahkan ke tujuan tersebut', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'admin-uuid',
        email: 'admin@unimed.ac.id',
        role: 'ADMIN',
        staffProfile: {
          id: 'staff-admin-id',
          name: 'Admin Utama',
          role: 'ADMIN',
          isActive: true,
        },
        studentProfile: null,
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      await expect(
        HomePage({ searchParams: Promise.resolve({ returnUrl: '/admin/projectors?tab=active' }) })
      ).rejects.toThrow('NEXT_REDIRECT: /admin/projectors?tab=active');

      expect(redirectSpy).toHaveBeenCalledWith('/admin/projectors?tab=active');
    });

    it('7. STUDENT dengan returnUrl /admin ditolak dan diarahkan ke /my-qr', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'student-uuid',
        email: 'mhs@unimed.ac.id',
        role: 'STUDENT',
        staffProfile: null,
        studentProfile: {
          id: 'student-id-1',
          nim: '4253250001',
          name: 'Mahasiswa Uji',
          registrationStatus: 'ACTIVE',
          currentClassId: 'class-uuid-1',
        },
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      await expect(
        HomePage({ searchParams: Promise.resolve({ returnUrl: '/admin' }) })
      ).rejects.toThrow('NEXT_REDIRECT: /my-qr');

      expect(redirectSpy).toHaveBeenCalledWith('/my-qr');
    });

    it('8. URL eksternal pada returnUrl ditolak dan dialihkan ke default role', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'admin-uuid',
        email: 'admin@unimed.ac.id',
        role: 'ADMIN',
        staffProfile: {
          id: 'staff-admin-id',
          name: 'Admin Utama',
          role: 'ADMIN',
          isActive: true,
        },
        studentProfile: null,
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      await expect(
        HomePage({ searchParams: Promise.resolve({ returnUrl: 'https://evil.attacker.com/malicious' }) })
      ).rejects.toThrow('NEXT_REDIRECT: /admin');

      expect(redirectSpy).toHaveBeenCalledWith('/admin');
    });

    it('9. Protocol-relative URL pada returnUrl ditolak dan dialihkan ke default role', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'staff-uuid',
        email: 'staff@unimed.ac.id',
        role: 'STAFF',
        staffProfile: {
          id: 'staff-petugas-id',
          name: 'Petugas TU',
          role: 'STAFF',
          isActive: true,
        },
        studentProfile: null,
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      await expect(
        HomePage({ searchParams: Promise.resolve({ returnUrl: '//evil.com/phishing' }) })
      ).rejects.toThrow('NEXT_REDIRECT: /kiosk');

      expect(redirectSpy).toHaveBeenCalledWith('/kiosk');
    });

    it('10. Tidak terjadi redirect loop saat returnUrl mengarah ke /login atau /', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'student-uuid',
        email: 'mhs@unimed.ac.id',
        role: 'STUDENT',
        staffProfile: null,
        studentProfile: {
          id: 'student-id-1',
          nim: '4253250001',
          name: 'Mahasiswa Uji',
          registrationStatus: 'ACTIVE',
          currentClassId: 'class-uuid-1',
        },
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      // Ketika returnUrl=/login diminta oleh pengguna yang sudah login
      await expect(
        HomePage({ searchParams: Promise.resolve({ returnUrl: '/login' }) })
      ).rejects.toThrow('NEXT_REDIRECT: /my-qr');

      expect(redirectSpy).toHaveBeenCalledWith('/my-qr');
    });
  });

  describe('D. Route /login Wrapper & Backward Compatibility', () => {
    it('11. Route /login tetap menampilkan Universal Login untuk pengguna belum login', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue(null);

      const jsx = await LoginPage({
        searchParams: Promise.resolve({}),
      });

      const html = renderToStaticMarkup(jsx);

      expect(html).toContain('Masuk ke Akun');
      expect(html).toContain('Alamat Email');
      expect(html).toContain('Kata Sandi');
      expect(html).toContain('Masuk Akun');
    });

    it('12. Route /login mengarahkan ADMIN yang sudah login ke /admin', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'admin-uuid',
        email: 'admin@unimed.ac.id',
        role: 'ADMIN',
        staffProfile: {
          id: 'staff-admin-id',
          name: 'Admin Utama',
          role: 'ADMIN',
          isActive: true,
        },
        studentProfile: null,
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      await expect(
        LoginPage({ searchParams: Promise.resolve({}) })
      ).rejects.toThrow('NEXT_REDIRECT: /admin');

      expect(redirectSpy).toHaveBeenCalledWith('/admin');
    });

    it('13. Route /login mengarahkan STUDENT yang sudah login ke /my-qr', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValue({
        userId: 'student-uuid',
        email: 'mhs@unimed.ac.id',
        role: 'STUDENT',
        staffProfile: null,
        studentProfile: {
          id: 'student-id-1',
          nim: '4253250001',
          name: 'Mahasiswa Uji',
          registrationStatus: 'ACTIVE',
          currentClassId: 'class-uuid-1',
        },
      });

      const redirectSpy = vi.spyOn(navigation, 'redirect');

      await expect(
        LoginPage({ searchParams: Promise.resolve({}) })
      ).rejects.toThrow('NEXT_REDIRECT: /my-qr');

      expect(redirectSpy).toHaveBeenCalledWith('/my-qr');
    });

    it('14. Database error saat session check di / secara aman fallback merender LoginForm', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockRejectedValue(new Error('DB Connection Timeout'));

      const jsx = await HomePage({
        searchParams: Promise.resolve({}),
      });

      const html = renderToStaticMarkup(jsx);

      expect(html).toContain('Masuk ke Akun');
      expect(html).toContain('Masuk Akun');
    });
  });
});
