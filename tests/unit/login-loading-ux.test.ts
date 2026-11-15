import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminLoading from '@/app/admin/loading';
import StudentQrLoading from '@/app/(student)/my-qr/loading';
import { getSafeRedirectDestination } from '@/lib/auth/redirect';

describe('Login & Dashboard Loading UX Improvements', () => {
  describe('AdminLoading Component', () => {
    it('renders accessible loading status container for Admin dashboard', () => {
      const html = renderToStaticMarkup(React.createElement(AdminLoading));

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Memuat Dasbor Tata Usaha"');
      expect(html).toContain('Panel Petugas &amp; Admin');
      expect(html).toContain('Menyiapkan data operasional dan status peminjaman...');
    });

    it('renders stat card skeletons without displaying any PII or sensitive values', () => {
      const html = renderToStaticMarkup(React.createElement(AdminLoading));

      expect(html).toContain('Total Unit');
      expect(html).toContain('Tersedia');
      expect(html).toContain('Sedang Dipinjam');
      expect(html).toContain('Terlambat');
      expect(html).toContain('Pemeliharaan');

      // Pastikan tidak ada data pengguna sensitif
      expect(html).not.toContain('NIM:');
      expect(html).not.toContain('auth_user_id');
      expect(html).not.toContain('email:');
      expect(html).not.toContain('password');
    });

    it('contains animated pulse classes for visual feedback', () => {
      const html = renderToStaticMarkup(React.createElement(AdminLoading));
      expect(html).toContain('animate-pulse');
    });
  });

  describe('StudentQrLoading Component', () => {
    it('renders accessible loading status container for Student QR Pass', () => {
      const html = renderToStaticMarkup(React.createElement(StudentQrLoading));

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Memuat QR Pass Mahasiswa"');
      expect(html).toContain('PINJAM Pass');
      expect(html).toContain('Menyiapkan QR Pass aman...');
    });

    it('renders QR placeholder container with security indicator and no PII', () => {
      const html = renderToStaticMarkup(React.createElement(StudentQrLoading));

      expect(html).toContain('Verifikasi sesi kriptografi');
      expect(html).toContain('animate-spin');

      // Pastikan tidak ada data mahasiswa spesifik atau token JWT
      expect(html).not.toContain('token=');
      expect(html).not.toContain('eyJ'); // Base64 JWT header
      expect(html).not.toContain('NIM:');
      expect(html).not.toContain('studentId');
    });

    it('contains animated ping/pulse indicators for live status cue', () => {
      const html = renderToStaticMarkup(React.createElement(StudentQrLoading));
      expect(html).toContain('animate-ping');
      expect(html).toContain('animate-pulse');
    });
  });

  describe('Safe Login Redirect Destination Logic', () => {
    const baseOrigin = 'https://pinjam.example.com';

    it('prioritizes valid returnUrl when navigating to /my-qr', () => {
      const dest = getSafeRedirectDestination('/my-qr', '/admin', baseOrigin);
      expect(dest).toBe('/my-qr');
    });

    it('redirects Admin to /admin when returnUrl is not provided', () => {
      const dest = getSafeRedirectDestination(null, '/admin', baseOrigin);
      expect(dest).toBe('/admin');
    });

    it('rejects external URLs in returnUrl and safely falls back to apiRedirectTo', () => {
      const dest = getSafeRedirectDestination('https://evil.com/hack', '/my-qr', baseOrigin);
      expect(dest).toBe('/my-qr');
    });

    it('rejects protocol-relative URLs (//) in returnUrl and falls back to safe path', () => {
      const dest = getSafeRedirectDestination('//evil.com/phishing', '/admin', baseOrigin);
      expect(dest).toBe('/admin');
    });

    it('rejects backslash evasion in returnUrl and falls back to safe path', () => {
      const dest = getSafeRedirectDestination('/\\evil.com', '/admin', baseOrigin);
      expect(dest).toBe('/admin');
    });

    it('preserves query parameters and hash on valid internal returnUrl', () => {
      const dest = getSafeRedirectDestination(
        '/admin/projectors?status=AVAILABLE#top',
        '/admin',
        baseOrigin
      );
      expect(dest).toBe('/admin/projectors?status=AVAILABLE#top');
    });

    it('safely falls back to default "/" when both returnUrl and apiRedirectTo are missing or invalid', () => {
      const dest = getSafeRedirectDestination(null, null, baseOrigin, '/');
      expect(dest).toBe('/');

      const destInvalid = getSafeRedirectDestination('https://evil.com', 'https://attacker.com', baseOrigin, '/');
      expect(destInvalid).toBe('/');
    });

    it('rejects returnUrl pointing exactly to /login and falls back to apiRedirectTo', () => {
      const dest = getSafeRedirectDestination('/login', '/my-qr', baseOrigin);
      expect(dest).toBe('/my-qr');
    });

    it('rejects returnUrl pointing to /login with query parameters and falls back to apiRedirectTo', () => {
      const dest = getSafeRedirectDestination(
        '/login?error=SessionExpired&returnUrl=%2Fadmin',
        '/admin',
        baseOrigin
      );
      expect(dest).toBe('/admin');
    });

    it('considers returnUrl /login-history as a valid internal path and does not reject it', () => {
      const dest = getSafeRedirectDestination('/login-history', '/my-qr', baseOrigin);
      expect(dest).toBe('/login-history');

      const destWithQuery = getSafeRedirectDestination(
        '/login-history?tab=recent#top',
        '/my-qr',
        baseOrigin
      );
      expect(destWithQuery).toBe('/login-history?tab=recent#top');
    });
  });
});
