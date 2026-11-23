import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
  useSearchParams: () => ({
    get: (key: string) => (key === 'tab' ? 'claims' : null),
  }),
}));

import LeaderClaimsInboxView from '@/components/admin/LeaderClaimsInboxView';
import AdminClassesPage from '@/app/admin/classes/page';

describe('Admin Leader Claims UI (FR-01F, FR-01D, GAP-01)', () => {
  const inboxSourcePath = path.resolve(
    process.cwd(),
    'src/components/admin/LeaderClaimsInboxView.tsx'
  );
  const inboxSource = fs.readFileSync(inboxSourcePath, 'utf-8');

  const classesPageSourcePath = path.resolve(
    process.cwd(),
    'src/app/admin/classes/page.tsx'
  );
  const classesPageSource = fs.readFileSync(classesPageSourcePath, 'utf-8');

  const dashboardViewSourcePath = path.resolve(
    process.cwd(),
    'src/components/admin/AdminDashboardView.tsx'
  );
  const dashboardViewSource = fs.readFileSync(dashboardViewSourcePath, 'utf-8');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Static Code Analysis & Contract Verification (LeaderClaimsInboxView)', () => {
    it('memiliki antarmuka pengambilan antrean di /api/admin/leader-claims', () => {
      expect(inboxSource).toContain('/api/admin/leader-claims');
      expect(inboxSource).toContain('fetchClaims');
    });

    it('memiliki pemanggilan keputusan persetujuan/penolakan ke /api/admin/leader-claims/[id]', () => {
      expect(inboxSource).toContain('/api/admin/leader-claims/${decisionModal.claim.id}');
      expect(inboxSource).toContain("method: 'PATCH'");
      expect(inboxSource).toContain('decision: decisionModal.type');
    });

    it('memiliki kartu metrik ringkasan antrean (Pending, Disetujui, Ditolak, Total)', () => {
      expect(inboxSource).toContain('summary.pending_count');
      expect(inboxSource).toContain('summary.approved_count');
      expect(inboxSource).toContain('summary.rejected_count');
      expect(inboxSource).toContain('summary.total_count');
      expect(inboxSource).toContain('Menunggu Keputusan');
      expect(inboxSource).toContain('Klaim Disetujui');
      expect(inboxSource).toContain('Klaim Ditolak');
      expect(inboxSource).toContain('Total Seluruh Klaim');
    });

    it('memiliki tab penyaringan status (PENDING, APPROVED, REJECTED, ALL)', () => {
      expect(inboxSource).toContain("id: 'PENDING', label: 'Menunggu'");
      expect(inboxSource).toContain("id: 'APPROVED', label: 'Disetujui'");
      expect(inboxSource).toContain("id: 'REJECTED', label: 'Ditolak'");
      expect(inboxSource).toContain("id: 'ALL', label: 'Semua Status'");
    });

    it('memiliki modal keputusan dengan peringatan pencabutan token pada tipe REPLACEMENT', () => {
      expect(inboxSource).toContain('handleOpenDecisionModal');
      expect(inboxSource).toContain('Setujui Klaim Ketua Kelas');
      expect(inboxSource).toContain('Peringatan Penggantian:');
      expect(inboxSource).toContain('otomatis menaikkan versi token QR ketua lama agar tidak berlaku lagi');
    });

    it('memiliki atribut aksesibilitas modal (role="dialog", aria-modal="true", aria-labelledby)', () => {
      expect(inboxSource).toContain('role="dialog"');
      expect(inboxSource).toContain('aria-modal="true"');
      expect(inboxSource).toContain('aria-labelledby="decision-modal-title"');
      expect(inboxSource).toContain('aria-label="Tutup modal"');
    });

    it('mewajibkan alasan penolakan jika permohonan ditolak', () => {
      expect(inboxSource).toContain('Catatan Keputusan Petugas');
      expect(inboxSource).toContain("decisionModal.type === 'REJECTED'");
      expect(inboxSource).toContain('Alasan penolakan klaim (wajib)...');
      expect(inboxSource).toContain("decisionModal.type === 'REJECTED' && !decisionNotes.trim()");
    });
  });

  describe('2. Static Code Analysis & Integration Verification (Admin Classes Page)', () => {
    it('memiliki tab navigasi antarmuka ganda (Daftar Kelas Baku & Antrean Klaim Ketua Kelas)', () => {
      expect(classesPageSource).toContain('Daftar Kelas Baku');
      expect(classesPageSource).toContain('Antrean Klaim Ketua Kelas');
      expect(classesPageSource).toContain("activeTab === 'classes'");
      expect(classesPageSource).toContain("activeTab === 'claims'");
    });

    it('mendukung sinkronisasi parameter URL ?tab=claims', () => {
      expect(classesPageSource).toContain("searchParams.get('tab')");
      expect(classesPageSource).toContain('/admin/classes?tab=claims');
    });

    it('mengintegrasikan komponen LeaderClaimsInboxView', () => {
      expect(classesPageSource).toContain('LeaderClaimsInboxView');
      expect(classesPageSource).toContain('<LeaderClaimsInboxView');
    });

    it('menampilkan badge jumlah antrean klaim tertunda (pending count)', () => {
      expect(classesPageSource).toContain('pendingClaimsCount');
      expect(classesPageSource).toContain('/api/admin/leader-claims?status=PENDING');
    });
  });

  describe('3. Dashboard Quick Access Verification', () => {
    it('memiliki navigasi cepat ke Antrean Klaim Ketua Kelas di Admin Dashboard', () => {
      expect(dashboardViewSource).toContain('/admin/classes?tab=claims');
      expect(dashboardViewSource).toContain('Klaim Ketua Kelas');
    });
  });

  describe('4. Initial SSR Rendering Tests', () => {
    it('merender LeaderClaimsInboxView tanpa crash', () => {
      const html = renderToStaticMarkup(React.createElement(LeaderClaimsInboxView));
      expect(html).toContain('Menunggu Keputusan');
      expect(html).toContain('Klaim Disetujui');
      expect(html).toContain('Klaim Ditolak');
      expect(html).toContain('Total Seluruh Klaim');
      expect(html).toContain('Memuat data antrean klaim ketua kelas...');
    });

    it('merender AdminClassesPage dalam Suspense boundary tanpa crash', () => {
      const html = renderToStaticMarkup(React.createElement(AdminClassesPage));
      expect(html).toContain('Manajemen Kelas &amp; Ketua Kelas');
      expect(html).toContain('Daftar Kelas Baku');
      expect(html).toContain('Antrean Klaim Ketua Kelas');
    });
  });
});
