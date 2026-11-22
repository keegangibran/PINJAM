import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock server-only
vi.mock('server-only', () => ({}));
import AuditLogsView from '@/components/admin/AuditLogsView';
import AdminAuditLogsPage from '@/app/admin/audit-logs/page';
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

describe('Admin Audit Logs UI Tests (GAP-03 / FR-19)', () => {
  const componentSourcePath = path.resolve(
    process.cwd(),
    'src/components/admin/AuditLogsView.tsx'
  );
  const componentSource = fs.readFileSync(componentSourcePath, 'utf-8');

  const pageSourcePath = path.resolve(
    process.cwd(),
    'src/app/admin/audit-logs/page.tsx'
  );
  const pageSource = fs.readFileSync(pageSourcePath, 'utf-8');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Static Code Analysis & Contract Verification (FR-19)', () => {
    it('memanggil endpoint API /api/admin/audit-logs', () => {
      expect(componentSource).toContain('/api/admin/audit-logs');
      expect(componentSource).toContain('fetchAuditLogs');
    });

    it('menampilkan penegasan sifat Append-Only (tidak dapat diubah atau dihapus)', () => {
      expect(componentSource).toContain('Append-Only (Tidak Dapat Diubah/Dihapus)');
      expect(componentSource).toContain('Buku catatan keamanan dan operasional append-only sesuai PRD Revisi 3 (FR-19)');
    });

    it('memastikan tidak ada tombol manipulasi atau hapus log (Strict Read-Only Viewer)', () => {
      // Tidak boleh ada tombol hapus audit log atau edit audit log
      expect(componentSource).not.toMatch(/<button[^>]*>.*Hapus Log.*<\/button>/i);
      expect(componentSource).not.toMatch(/<button[^>]*>.*Edit Log.*<\/button>/i);
      expect(componentSource).not.toMatch(/<button[^>]*>.*Delete.*<\/button>/i);
      expect(componentSource).not.toMatch(/handleDelete/);
      expect(componentSource).not.toMatch(/handleUpdate/);
    });

    it('menyediakan opsi filter lengkap: tindakan, tipe entitas, tipe aktor, dan rentang tanggal', () => {
      expect(componentSource).toContain('filterAction');
      expect(componentSource).toContain('filterEntityType');
      expect(componentSource).toContain('filterActorType');
      expect(componentSource).toContain('startDate');
      expect(componentSource).toContain('endDate');
      expect(componentSource).toContain('handleResetFilters');
    });

    it('menyediakan dialog modal rincian metadata JSON dengan tombol salin', () => {
      expect(componentSource).toContain('audit-modal-title');
      expect(componentSource).toContain('Metadata (JSON Disanitasi):');
      expect(componentSource).toContain('handleCopyJson');
      expect(componentSource).toContain('Salin JSON');
    });
  });

  describe('2. Initial Component SSR Render', () => {
    it('merender judul halaman, badge append-only, dan state loading awal tanpa crash', () => {
      const html = renderToStaticMarkup(React.createElement(AuditLogsView));

      expect(html).toContain('Jejak Audit Sistem (Audit Logs)');
      expect(html).toContain('Buku catatan keamanan dan operasional append-only');
      expect(html).toContain('Append-Only (Tidak Dapat Diubah/Dihapus)');
      expect(html).toContain('Memuat catatan audit log...');
      expect(html).toContain('Kembali ke Dashboard Admin');
      expect(html).toContain('Semua Tindakan');
      expect(html).toContain('Semua Entitas');
      expect(html).toContain('Semua Aktor');
    });
  });

  describe('3. Server-Side Page Route Protection (src/app/admin/audit-logs/page.tsx)', () => {
    it('mengalihkan (redirect) ke /login jika pengguna belum login', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce(null);

      await AdminAuditLogsPage();
      expect(nextNavigation.redirect).toHaveBeenCalledWith(
        '/login?returnUrl=/admin/audit-logs'
      );
    });

    it('mengalihkan (redirect) ke /admin jika pengguna bukan peran ADMIN', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-staff',
        email: 'staff@unimed.ac.id',
        role: 'STAFF',
        staffProfile: { id: 'stf-staff', name: 'Petugas TU', role: 'STAFF', isActive: true },
      });

      await AdminAuditLogsPage();
      expect(nextNavigation.redirect).toHaveBeenCalledWith('/admin');
    });

    it('mengalihkan (redirect) ke /admin jika akun ADMIN berstatus nonaktif', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-admin-inactive',
        email: 'admin.inactive@unimed.ac.id',
        role: 'ADMIN',
        staffProfile: { id: 'stf-admin-x', name: 'Admin Nonaktif', role: 'ADMIN', isActive: false },
      });

      await AdminAuditLogsPage();
      expect(nextNavigation.redirect).toHaveBeenCalledWith('/admin');
    });

    it('mengizinkan akses dan merender AuditLogsView jika pengguna adalah ADMIN aktif', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-admin-active',
        email: 'admin@unimed.ac.id',
        role: 'ADMIN',
        staffProfile: { id: 'stf-admin-1', name: 'Admin Aktif', role: 'ADMIN', isActive: true },
      });

      const element = await AdminAuditLogsPage();
      expect(element).not.toBeNull();
      expect(element!.type).toBe(AuditLogsView);
    });
  });
});
