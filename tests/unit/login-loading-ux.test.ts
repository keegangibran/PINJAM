import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminLoading from '@/app/admin/loading';
import StudentQrLoading from '@/app/(student)/my-qr/loading';

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
});
