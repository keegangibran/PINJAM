import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock server-only
vi.mock('server-only', () => ({}));
import StaffManagementView from '@/components/admin/StaffManagementView';
import AdminStaffPage from '@/app/admin/staff/page';
import * as guards from '@/lib/auth/guards';
import * as nextNavigation from 'next/navigation';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  redirect: vi.fn(),
}));

describe('Admin Staff Management UI Tests (GAP-02 / NFR-03)', () => {
  const componentSourcePath = path.resolve(
    process.cwd(),
    'src/components/admin/StaffManagementView.tsx'
  );
  const componentSource = fs.readFileSync(componentSourcePath, 'utf-8');

  const pageSourcePath = path.resolve(
    process.cwd(),
    'src/app/admin/staff/page.tsx'
  );
  const pageSource = fs.readFileSync(pageSourcePath, 'utf-8');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Static Code Analysis & Contract Verification (NFR-03)', () => {
    it('memiliki antarmuka dan pemanggilan API manajemen staf di /api/admin/staff', () => {
      expect(componentSource).toContain('/api/admin/staff');
      expect(componentSource).toContain('fetchStaff');
      expect(componentSource).toContain('handleCreateStaff');
      expect(componentSource).toContain('handleExecuteStatusToggle');
    });

    it('memuat teks kepatuhan NFR-03 (satu akun per petugas, dilarang berbagi akun)', () => {
      expect(componentSource).toContain('Kepatuhan Keamanan (NFR-03)');
      expect(componentSource).toContain('Satu akun hanya untuk satu petugas. Dilarang berbagi akun.');
    });

    it('memiliki pencegahan UI untuk penonaktifkan akun sendiri (Self-Deactivation Guard)', () => {
      expect(componentSource).toContain('currentStaffId');
      expect(componentSource).toContain('Akun Anda saat ini');
      expect(componentSource).toContain('Terkunci (Akun Aktif)');
    });

    it('memiliki dialog modal konfirmasi sebelum aksi penonaktifan atau pengaktifan', () => {
      expect(componentSource).toContain('confirm-status-modal-title');
      expect(componentSource).toContain('Nonaktifkan Akun Petugas?');
      expect(componentSource).toContain('Aktifkan Kembali Akun Petugas?');
    });
  });

  describe('2. Initial Component SSR Render', () => {
    it('merender judul halaman, kartu statistik, dan state loading awal tanpa crash', () => {
      const html = renderToStaticMarkup(
        React.createElement(StaffManagementView, { currentStaffId: 'stf-admin-1' })
      );

      expect(html).toContain('Manajemen Akun Petugas &amp; Staf TU');
      expect(html).toContain('Total Petugas');
      expect(html).toContain('Staf Aktif');
      expect(html).toContain('Administrator');
      expect(html).toContain('Akun Nonaktif');
      expect(html).toContain('Memuat data akun petugas...');
      expect(html).toContain('Tambah / Undang Petugas');
      expect(html).toContain('Kembali ke Dashboard Admin');
    });
  });

  describe('3. Server-Side Page Route Protection (src/app/admin/staff/page.tsx)', () => {
    it('mengalihkan (redirect) ke /login jika pengguna belum login', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce(null);

      await AdminStaffPage();
      expect(nextNavigation.redirect).toHaveBeenCalledWith('/login?returnUrl=/admin/staff');
    });

    it('mengalihkan (redirect) ke /admin jika pengguna bukan peran ADMIN', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-staff',
        email: 'petugas@unimed.ac.id',
        role: 'STAFF',
        staffProfile: { id: 'stf-staff', name: 'Petugas Biasa', role: 'STAFF', isActive: true },
      });

      await AdminStaffPage();
      expect(nextNavigation.redirect).toHaveBeenCalledWith('/admin');
    });

    it('mengalihkan (redirect) ke /admin jika akun ADMIN berstatus nonaktif', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-admin-inactive',
        email: 'admin.inactive@unimed.ac.id',
        role: 'ADMIN',
        staffProfile: { id: 'stf-admin-x', name: 'Admin Nonaktif', role: 'ADMIN', isActive: false },
      });

      await AdminStaffPage();
      expect(nextNavigation.redirect).toHaveBeenCalledWith('/admin');
    });

    it('mengizinkan akses dan merender StaffManagementView jika pengguna adalah ADMIN aktif', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-admin-active',
        email: 'admin.active@unimed.ac.id',
        role: 'ADMIN',
        staffProfile: { id: 'stf-admin-1', name: 'Admin Aktif', role: 'ADMIN', isActive: true },
      });

      const element = await AdminStaffPage();
      expect(element).not.toBeNull();
      expect(element!.type).toBe(StaffManagementView);
      expect(element!.props.currentStaffId).toBe('stf-admin-1');
    });
  });
});
