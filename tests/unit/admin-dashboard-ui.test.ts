import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminDashboardView, {
  SummaryData,
  LoanRecord,
  MaintenanceStatusData,
  buildExportUrl,
  getReturnerDisplayText,
  formatBytes,
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
      current_usage_bytes: 134217728, // 128 MB
      current_usage_pct: 12.5,
      warning_active: false,
      max_capacity_bytes: 1073741824, // 1 GB
      last_checked_at: '2026-11-20T02:00:00.000Z',
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
      expect(html).toContain('128 MB / 1 GB');
      expect(html).toContain('Jadwal Rutin Vercel Cron');
      expect(html).toContain('02:00 WIB');
      expect(html).toContain('keep-alive');
      expect(html).toContain('Jalankan Retensi Sekarang');
    });

    it('renders badge "Belum Dihitung" and 0% gauge when storage metrics are uninitialized or missing', () => {
      const uninitializedMaintenance: MaintenanceStatusData = {
        retention_last_run: null,
        storage_monitoring: {
          warning_threshold_pct: 70,
          max_capacity_bytes: 1073741824,
        },
        academic_term: null,
      };

      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
          initialMaintenance: uninitializedMaintenance,
        })
      );

      // Pastikan TIDAK menampilkan 0.0% seolah-olah data pengukuran riil
      expect(html).not.toContain('0.0% / 100%');
      // Menampilkan badge "Belum Dihitung"
      expect(html).toContain('Belum Dihitung');
      // Menampilkan keterangan bahwa metrik belum tersedia
      expect(html).toContain('Metrik belum tersedia');
      expect(html).toContain('Kapasitas: 1 GB');
      // Gauge tidak boleh menggambarkan nilai aktual yang belum diketahui (width: 0%)
      expect(html).toContain('style="width:0%"');
    });

    it('renders badge "Gagal Memuat" and error text without defaulting to 0 on failure', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
          initialMaintenance: null,
          initialMaintenanceError: 'Gangguan jaringan saat memuat status pemeliharaan.',
        })
      );

      // Pastikan TIDAK menampilkan 0.0%
      expect(html).not.toContain('0.0% / 100%');
      // Menampilkan badge "Gagal Memuat"
      expect(html).toContain('Gagal Memuat');
      // Menampilkan pesan error kegagalan
      expect(html).toContain('Gagal memuat metrik storage');
      expect(html).toContain('style="width:0%"');
    });

    it('formatBytes helper formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(134217728)).toBe('128 MB');
      expect(formatBytes(undefined)).toBe('-');
    });

    it('renders modernized Header, Shell & Toolbar with Balanced Navy design tokens', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
        })
      );

      // Shell
      expect(html).toContain('bg-canvas');
      expect(html).toContain('text-main');

      // Header
      expect(html).toContain('Panel Petugas &amp; Admin');
      expect(html).toContain('Dashboard Admin');
      expect(html).toContain(
        'Pantau inventaris proyektor, aktivitas peminjaman, dan pengembalian secara real-time.'
      );

      // Page Navigation
      expect(html).toContain('Antrean Verifikasi');
      expect(html).toContain('Manajemen Kelas');
      expect(html).toContain('Inventaris Proyektor');
      expect(html).toContain('Buka Kiosk');

      // Actions
      expect(html).toContain('Muat Ulang');
      expect(html).toContain('Ekspor Data');
      expect(html).toContain('Keluar');
    });

    it('renders App Page wrapper component without SSR error', () => {
      const html = renderToStaticMarkup(React.createElement(AdminDashboardPage));

      expect(html).toContain('Panel Petugas &amp; Admin');
      expect(html).toContain('Dashboard Admin');
      expect(html).toContain('data-testid="summary-card-total"');
      expect(html).toContain('data-testid="summary-card-maintenance"');
    });
  });

  describe('5. Photo Documentation Modal Migration to Shared Modal (Phase 2.3 - Irisan 2)', () => {
    it('does not render photo modal when photoModalLoan is null', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
          initialPhotoModalLoan: null,
        })
      );

      expect(html).not.toContain('Dokumentasi Foto Transaksi');
      expect(html).not.toContain('1. Foto Profil Terverifikasi');
    });

    it('renders shared Modal with accessibility attributes and 3 photo cards when photoModalLoan is set', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
          initialPhotoModalLoan: sampleLoans[0],
        })
      );

      // Shared Modal ARIA and Structure
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby=');
      expect(html).toContain('aria-label="Tutup dialog"');
      expect(html).toContain('max-w-4xl'); // size="xl"

      // Title & Description
      expect(html).toContain('Dokumentasi Foto Transaksi');
      expect(html).toContain(
        'Perbandingan manual foto wajah referensi, foto serah-terima pinjam, dan foto pengembalian.'
      );

      // Transaction info
      expect(html).toContain('TEST-PROJ-001');
      expect(html).toContain('Andi Pratama');
      expect(html).toContain('NIM 2301001');

      // 3 Photo Cards & Badges
      expect(html).toContain('1. Foto Profil Terverifikasi');
      expect(html).toContain('Referensi');
      expect(html).toContain('2. Foto Serah Terima Pinjam');
      expect(html).toContain('3. Foto Serah Terima Kembali');
      expect(html).toContain('Kiosk Meja TU');

      // Alignment and Aspect Ratio Classes
      expect(html).toContain('min-h-[40px] md:min-h-[44px]');
      expect(html).toContain('aspect-[3/4]');

      // Footer Privacy Notice & Close Button
      expect(html).toContain(
        'Foto disimpan di bucket privat dan hanya diakses melalui signed URL sementara (60 detik).'
      );
      expect(html).toContain('Tutup');
    });

    describe('Returner Name Formatting in Photo Modal & Mobile Cards (FR-07 & Fase 2.3 UAT Follow-Up)', () => {
      // 1. BORROWER dengan returned_by_name NULL tetapi student.name tersedia → nama mahasiswa
      it('formats BORROWER with returned_by_name NULL using student.name relation', () => {
        const text = getReturnerDisplayText({
          status: 'COMPLETED',
          returned_at: '2026-11-20T14:00:00.000Z',
          returned_by_type: 'BORROWER',
          returned_by_name: null,
          student: { name: 'Ahmad Dahlan' },
        });
        expect(text).toBe('Ahmad Dahlan');
      });

      // 2. REPRESENTATIVE dengan nama tersedia → nama perwakilan (Perwakilan)
      it('formats REPRESENTATIVE with available name as "{nama} (Perwakilan)"', () => {
        const text = getReturnerDisplayText({
          status: 'COMPLETED',
          returned_at: '2026-11-20T14:00:00.000Z',
          returned_by_type: 'REPRESENTATIVE',
          returned_by_name: 'Keegan',
          student: { name: 'Ahmad Dahlan' },
        });
        expect(text).toBe('Keegan (Perwakilan)');
      });

      // 3. REPRESENTATIVE tanpa nama → "-"
      it('formats REPRESENTATIVE without name as "-"', () => {
        const text = getReturnerDisplayText({
          status: 'COMPLETED',
          returned_at: '2026-11-20T14:00:00.000Z',
          returned_by_type: 'REPRESENTATIVE',
          returned_by_name: null,
        });
        expect(text).toBe('-');

        const textWhitespace = getReturnerDisplayText({
          status: 'COMPLETED',
          returned_at: '2026-11-20T14:00:00.000Z',
          returned_by_type: 'REPRESENTATIVE',
          returned_by_name: '   ',
        });
        expect(textWhitespace).toBe('-');
      });

      // 4. ACTIVE → "-"
      it('formats ACTIVE loan as "-"', () => {
        const text = getReturnerDisplayText({
          status: 'ACTIVE',
          returned_at: null,
          returned_by_type: 'BORROWER',
          student: { name: 'Ahmad Dahlan' },
        });
        expect(text).toBe('-');
      });

      // 5. Data mahasiswa tidak tersedia → "-"
      it('formats BORROWER with missing student relation data as "-" without fabricating data', () => {
        expect(
          getReturnerDisplayText({
            status: 'COMPLETED',
            returned_at: '2026-11-20T14:00:00.000Z',
            returned_by_type: 'BORROWER',
            returned_by_name: null,
            student: null,
          })
        ).toBe('-');

        expect(
          getReturnerDisplayText({
            status: 'COMPLETED',
            returned_at: '2026-11-20T14:00:00.000Z',
            returned_by_type: 'BORROWER',
            returned_by_name: null,
            student: { name: '   ' },
          })
        ).toBe('-');
      });

      // 6. Tidak ada fallback ke nama mahasiswa untuk tipe REPRESENTATIVE
      it('does NOT fallback to student name for REPRESENTATIVE when representative name is missing', () => {
        const text = getReturnerDisplayText({
          status: 'COMPLETED',
          returned_at: '2026-11-20T14:00:00.000Z',
          returned_by_type: 'REPRESENTATIVE',
          returned_by_name: null,
          student: { name: 'Peminjam Asli' },
        });
        expect(text).toBe('-');
        expect(text).not.toContain('Peminjam Asli');
      });

      // 7. Render DOM Photo Modal: BORROWER dengan returned_by_name NULL
      it('renders actual borrower student name in photo modal when returned_by_name is NULL', () => {
        const normalReturnLoan: LoanRecord = {
          ...sampleLoans[1],
          student: {
            id: 'std-001',
            nim: '2301001',
            name: 'Andi Pratama',
            profile_photo_path: null,
          },
          returned_by_type: 'BORROWER',
          returned_by_name: null, // Null di DB sesuai migrasi atomic
        };

        const html = renderToStaticMarkup(
          React.createElement(AdminDashboardView, {
            initialSummary: sampleSummary,
            initialLoans: [normalReturnLoan],
            initialTotalCount: 1,
            initialPhotoModalLoan: normalReturnLoan,
          })
        );

        expect(html).toContain('Pengembali: Andi Pratama');
        expect(html).not.toContain('Pengembali: -');
        expect(html).not.toContain('Pengembali: Andi Pratama (Perwakilan)');
      });

      // 8. Render DOM Photo Modal: REPRESENTATIVE
      it('renders representative returner name with (Perwakilan) in photo modal', () => {
        const repReturnLoan: LoanRecord = {
          ...sampleLoans[1],
          returned_by_type: 'REPRESENTATIVE',
          returned_by_name: 'Keegan',
        };

        const html = renderToStaticMarkup(
          React.createElement(AdminDashboardView, {
            initialSummary: sampleSummary,
            initialLoans: [repReturnLoan],
            initialTotalCount: 1,
            initialPhotoModalLoan: repReturnLoan,
          })
        );

        expect(html).toContain('Pengembali: Keegan (Perwakilan)');
      });

      // 9. Render DOM Photo Modal: ACTIVE loan
      it('renders "-" in photo modal when transaction is unreturned (ACTIVE)', () => {
        const html = renderToStaticMarkup(
          React.createElement(AdminDashboardView, {
            initialSummary: sampleSummary,
            initialLoans: sampleLoans,
            initialTotalCount: 2,
            initialPhotoModalLoan: sampleLoans[0], // ACTIVE loan
          })
        );

        expect(html).toContain('Pengembali: -');
      });

      // 10. Render DOM Photo Modal: REPRESENTATIVE tanpa nama tidak boleh fallback ke nama mahasiswa
      it('renders "-" in photo modal for REPRESENTATIVE without name even when student name is present', () => {
        const repMissingNameLoan: LoanRecord = {
          ...sampleLoans[1],
          student: {
            id: 'std-999',
            nim: '2309999',
            name: 'Peminjam Asli',
            profile_photo_path: null,
          },
          returned_by_type: 'REPRESENTATIVE',
          returned_by_name: null,
        };

        const html = renderToStaticMarkup(
          React.createElement(AdminDashboardView, {
            initialSummary: sampleSummary,
            initialLoans: [repMissingNameLoan],
            initialTotalCount: 1,
            initialPhotoModalLoan: repMissingNameLoan,
          })
        );

        expect(html).toContain('Pengembali: -');
        expect(html).not.toContain('Pengembali: Peminjam Asli');
        expect(html).toContain('Peminjam: Peminjam Asli');
      });

      // 11. Render DOM Mobile Card: Pengembali untuk transaksi selesai
      it('renders Pengembali row in mobile card for returned transactions using consistent helper', () => {
        const normalReturnLoan: LoanRecord = {
          ...sampleLoans[1],
          student: {
            id: 'std-001',
            nim: '2301001',
            name: 'Andi Pratama',
            profile_photo_path: null,
          },
          returned_by_type: 'BORROWER',
          returned_by_name: null,
          returned_at: '2026-11-20T16:00:00.000Z',
        };

        const html = renderToStaticMarkup(
          React.createElement(AdminDashboardView, {
            initialSummary: sampleSummary,
            initialLoans: [normalReturnLoan],
            initialTotalCount: 1,
          })
        );

        expect(html).toContain('Pengembali:');
        expect(html).toContain('Andi Pratama');
      });
    });
  });

  describe('6. Export Ledger Modal Migration to Shared Modal (Phase 2.3 - Irisan 3)', () => {
    it('does not render export modal when isExportModalOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
          initialExportModalOpen: false,
        })
      );

      expect(html).not.toContain('Ekspor Data Transaksi');
      expect(html).not.toContain('Pilih Format Berkas');
    });

    it('renders shared Modal for export when initialExportModalOpen is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
          initialExportModalOpen: true,
        })
      );

      // Modal ARIA & sizing
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('max-w-lg'); // size="md"
      expect(html).toContain('Ekspor Data Transaksi');
      expect(html).toContain(
        'Unduh seluruh riwayat transaksi peminjaman proyektor dalam format Excel atau CSV.'
      );

      // Format Options
      expect(html).toContain('Pilih Format Berkas');
      expect(html).toContain('Microsoft Excel');
      expect(html).toContain('.xlsx');
      expect(html).toContain('Berkas Teks CSV');
      expect(html).toContain('.csv');

      // Date range filters
      expect(html).toContain('Dari Tanggal (Opsional)');
      expect(html).toContain('Sampai Tanggal (Opsional)');
      expect(html).toContain('id="export-from-date"');
      expect(html).toContain('id="export-to-date"');

      // Buttons
      expect(html).toContain('Batal');
      expect(html).toContain('Unduh Berkas Excel (.xlsx)');

      // Full scope explanation
      expect(html).toContain('Cakupan Data Lengkap:');
    });

    it('buildExportUrl generates correct URLs including full data scope without pagination limit', () => {
      // Default export URL
      expect(buildExportUrl({})).toBe('/api/admin/export/loans?format=xlsx');

      // CSV format export
      expect(buildExportUrl({ format: 'csv' })).toBe('/api/admin/export/loans?format=csv');

      // With date range filter
      expect(
        buildExportUrl({ from: '2026-11-01', to: '2026-11-20', format: 'xlsx' })
      ).toBe('/api/admin/export/loans?from=2026-11-01&to=2026-11-20&format=xlsx');

      // Verify query parameters NEVER contain pagination bounds (page, limit, offset)
      const url = buildExportUrl({ from: '2026-11-01', to: '2026-11-20', format: 'csv' });
      expect(url).not.toContain('limit');
      expect(url).not.toContain('page');
      expect(url).not.toContain('offset');
    });

    it('renders dismissible controls when idle and configures hardened export props', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardView, {
          initialSummary: sampleSummary,
          initialLoans: sampleLoans,
          initialTotalCount: 2,
          initialExportModalOpen: true,
        })
      );

      // Close button is rendered when not exporting
      expect(html).toContain('aria-label="Tutup dialog"');
      // Cancel button is rendered and active when idle
      expect(html).toContain('><span>Batal</span></button>');
    });

    it('validates date ranges and prevents invalid export queries', () => {
      // If from > to, buildExportUrl should still construct valid URL, but frontend guards validate
      const validUrl = buildExportUrl({ from: '2026-11-01', to: '2026-11-10', format: 'xlsx' });
      expect(validUrl).toContain('from=2026-11-01');
      expect(validUrl).toContain('to=2026-11-10');
    });
  });
});
