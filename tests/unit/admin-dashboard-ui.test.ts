import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminDashboardView, {
  SummaryData,
  LoanRecord,
  MaintenanceStatusData,
} from '@/components/admin/AdminDashboardView';
import AdminDashboardPage from '@/app/admin/page';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

describe('Admin Dashboard UI/UX & Responsive Ledger Tests (Fase 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            summary: {
              total_projectors: 5,
              available_count: 2,
              borrowed_count: 2,
              overdue_count: 1,
              maintenance_count: 1,
            },
            loans: [],
            total_count: 0,
          }),
      })
    );
  });

  const sampleSummary: SummaryData = {
    total_projectors: 10,
    available_count: 4,
    borrowed_count: 3,
    overdue_count: 1,
    maintenance_count: 3,
  };

  const sampleLoans: LoanRecord[] = [
    {
      id: 'loan-001',
      borrowed_at: '2026-11-20T08:00:00.000Z',
      due_at: '2026-11-20T17:00:00.000Z',
      returned_at: null,
      status: 'ACTIVE',
      is_overdue: false,
      borrow_identification_method: 'QR',
      returned_by_type: null,
      returned_by_name: null,
      return_condition: null,
      damage_notes: null,
      borrow_photo_path: 'loans/loan-001/borrow.jpg',
      return_photo_path: null,
      student: {
        id: 'std-1',
        nim: '2301001',
        name: 'Andi Pratama',
        profile_photo_path: 'students/std-1/profile.jpg',
      },
      class: {
        id: 'cls-1',
        study_program: 'Teknik Informatika',
        cohort_year: 2023,
        section: 'TI-3A',
        academic_term: '2026/2027 Ganjil',
      },
      projector: {
        id: 'proj-1',
        code: 'TEST-PROJ-001',
        name: 'Epson EB-X500 Unit A',
        status: 'BORROWED',
      },
      borrow_staff: {
        id: 'stf-1',
        name: 'Budi Santoso',
        role: 'STAFF',
      },
      return_staff: null,
    },
    {
      id: 'loan-002',
      borrowed_at: '2026-11-19T09:00:00.000Z',
      due_at: '2026-11-19T17:00:00.000Z',
      returned_at: '2026-11-19T16:30:00.000Z',
      status: 'COMPLETED',
      is_overdue: false,
      borrow_identification_method: 'QR',
      returned_by_type: 'REPRESENTATIVE',
      returned_by_name: 'Dewi Lestari',
      return_condition: 'REPORTED_ISSUE',
      damage_notes: 'Port HDMI longgar dan gambar kadang flickering warna ungu.',
      borrow_photo_path: 'loans/loan-002/borrow.jpg',
      return_photo_path: 'loans/loan-002/return.jpg',
      student: {
        id: 'std-2',
        nim: '2301002',
        name: 'Siti Rahma',
        profile_photo_path: 'students/std-2/profile.jpg',
      },
      class: {
        id: 'cls-2',
        study_program: 'Sistem Informasi',
        cohort_year: 2023,
        section: 'SI-3B',
        academic_term: '2026/2027 Ganjil',
      },
      projector: {
        id: 'proj-3',
        code: 'TEST-PROJ-003',
        name: 'Epson EB-X500 Unit C',
        status: 'MAINTENANCE',
      },
      borrow_staff: {
        id: 'stf-1',
        name: 'Budi Santoso',
        role: 'STAFF',
      },
      return_staff: {
        id: 'stf-2',
        name: 'Citra Admin',
        role: 'STAFF',
      },
    },
  ];

  const sampleMaintenance: MaintenanceStatusData = {
    retention_last_run: {
      last_run_at: '2026-11-20T02:00:00.000Z',
      status: 'SUCCESS',
      storage_usage_pct: 12.5,
    },
    storage_monitoring: {
      current_usage_pct: 12.5,
      warning_active: false,
    },
    academic_term: {
      current_term: '2026/2027 Ganjil',
    },
  };

  describe('1. Summary Metric Cards (5 Cards Interactivity & Layout)', () => {
    it('renders all 5 metric cards with correct values and titles', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
        })
      );

      // Card 1: Total Unit Aktif
      expect(html).toContain('data-testid="summary-card-total"');
      expect(html).toContain('Total Unit Aktif');
      expect(html).toContain('10');

      // Card 2: Tersedia
      expect(html).toContain('data-testid="summary-card-available"');
      expect(html).toContain('Tersedia');
      expect(html).toContain('4');

      // Card 3: Sedang Dipinjam
      expect(html).toContain('data-testid="summary-card-borrowed"');
      expect(html).toContain('Sedang Dipinjam');
      expect(html).toContain('3');

      // Card 4: Terlambat
      expect(html).toContain('data-testid="summary-card-overdue"');
      expect(html).toContain('Terlambat');
      expect(html).toContain('1');

      // Card 5: Dalam Perawatan
      expect(html).toContain('data-testid="summary-card-maintenance"');
      expect(html).toContain('Dalam Perawatan');
      expect(html).toContain('3');
    });

    it('applies col-span-2 md:col-span-1 to Card 5 (Dalam Perawatan) for balanced mobile grid', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
        })
      );

      // Verify Card 5 has col-span-2 on mobile and md:col-span-1 on desktop
      expect(html).toContain('data-testid="summary-card-maintenance"');
      expect(html).toMatch(/data-testid="summary-card-maintenance"[^>]*col-span-2 md:col-span-1/);
    });

    it('renders Warning Banner when overdue proyektors exist', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
        })
      );

      expect(html).toContain('Perhatian: 1 unit proyektor melewati batas waktu pengembalian!');
      expect(html).toContain('Tampilkan Hanya Unit Terlambat');
    });
  });

  describe('2. Responsive Ledger: Desktop Table vs Mobile Cards', () => {
    it('renders desktop table with hidden md:block and 9 columns', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
        })
      );

      // Desktop table wrapper
      expect(html).toContain('hidden md:block overflow-x-auto');
      expect(html).toContain('Waktu Pinjam &amp; Batas');
      expect(html).toContain('Waktu Kembali');
      expect(html).toContain('Peminjam');
      expect(html).toContain('Kelas');
      expect(html).toContain('Proyektor');
      expect(html).toContain('Dokumentasi');
      expect(html).toContain('Pengembali');
      expect(html).toContain('Petugas');
      expect(html).toContain('Status');

      // Desktop row contains testid
      expect(html).toContain('data-testid="desktop-loan-row"');
    });

    it('renders mobile cards with block md:hidden and direct damage notes without hover', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
        })
      );

      // Mobile list wrapper
      expect(html).toContain('data-testid="mobile-loans-list"');
      expect(html).toContain('block md:hidden');
      expect(html).toContain('data-testid="mobile-loan-card"');

      // Active loan on mobile
      expect(html).toContain('TEST-PROJ-001');
      expect(html).toContain('Andi Pratama');
      expect(html).toContain('NIM 2301001');
      expect(html).toContain('TI-3A');

      // Reported issue loan on mobile with direct damage notes in amber alert box
      expect(html).toContain('TEST-PROJ-003');
      expect(html).toContain('data-testid="mobile-damage-notes"');
      expect(html).toContain('Port HDMI longgar dan gambar kadang flickering warna ungu.');

      // Touch friendly "Lihat Foto" button on mobile
      expect(html).toContain('Lihat Foto Dokumentasi');
      expect(html).toContain('min-h-[38px]');
    });
  });

  describe('3. Server-Side Pagination Bar (FR-11, Phase 3)', () => {
    it('does not render pagination bar when totalCount is 0', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: [],
          initialTotalCount: 0,
        })
      );

      expect(html).not.toContain('data-testid="pagination-bar"');
      expect(html).toContain('Tidak ada transaksi ditemukan');
    });

    it('renders pagination bar with item range and disabled "Sebelumnya" on page 1 of 1', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
        })
      );

      expect(html).toContain('data-testid="pagination-bar"');
      expect(html).toContain('Menampilkan');
      expect(html).toContain('>1<'); // 1
      expect(html).toContain('>2<'); // to 2
      expect(html).toContain('dari <span class="font-semibold text-slate-900">2</span> transaksi');

      // Previous and Next buttons
      expect(html).toContain('data-testid="pagination-prev"');
      expect(html).toContain('data-testid="pagination-next"');
      expect(html).toContain('data-testid="pagination-page-1"');
    });

    it('calculates totalPages properly for multi-page counts (e.g. 25 transactions = 3 pages)', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 25,
        })
      );

      expect(html).toContain('data-testid="pagination-bar"');
      expect(html).toContain('dari <span class="font-semibold text-slate-900">25</span> transaksi');
      expect(html).toContain('data-testid="pagination-page-1"');
      expect(html).toContain('data-testid="pagination-page-2"');
      expect(html).toContain('data-testid="pagination-page-3"');
    });

    it('renders ellipsis when totalPages > 7', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 100, // 10 pages
        })
      );

      expect(html).toContain('data-testid="pagination-bar"');
      expect(html).toContain('dari <span class="font-semibold text-slate-900">100</span> transaksi');
      expect(html).toContain('data-testid="pagination-page-1"');
      expect(html).toContain('data-testid="pagination-page-10"');
      expect(html).toContain('…'); // Ellipsis
    });
  });

  describe('4. Preservation of Panel Storage & Export Modal', () => {
    it('renders Scheduled Maintenance & Storage Quota Monitoring with quota meter and cron schedule', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
          initialMaintenance: sampleMaintenance,
        })
      );

      expect(html).toContain('Pemeliharaan Terjadwal &amp; Kuota Storage (NFR-10)');
      expect(html).toContain('Pemakaian Kuota Storage');
      expect(html).toContain('12.5% / 100%');
      expect(html).toContain('Kapasitas: 1 GB');
      expect(html).toContain('Jadwal Rutin Vercel Cron');
      expect(html).toContain('02:00 WIB');
      expect(html).toContain('keep-alive');
      expect(html).toContain('Jalankan Retensi Sekarang');
    });

    it('renders App Page wrapper component without SSR error', () => {
      const html = renderToStaticMarkup(React.createElement(AdminDashboardPage));

      expect(html).toContain('Panel Petugas &amp; Admin');
      expect(html).toContain('Dashboard Buku Besar Digital');
      expect(html).toContain('data-testid="summary-card-total"');
      expect(html).toContain('data-testid="summary-card-maintenance"');
    });
  });
});
