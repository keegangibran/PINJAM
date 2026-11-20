import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminProjectorsPage from '@/app/admin/projectors/page';
import {
  AdminProjectorsContent,
  ProjectorItem,
  VALID_STATUS_FILTERS,
} from '@/components/admin/ProjectorsInventoryView';

// Mock next/navigation
const mockPush = vi.fn();
let mockSearchParamsMap = new Map<string, string>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsMap.get(key) ?? null,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => React.createElement('svg', { 'data-testid': 'mock-qrcode' }),
}));

describe('Admin Projectors Page Status Query Parameter Filter (FASE 2)', () => {
  const sampleProjectors: ProjectorItem[] = [
    {
      id: 'prj-1',
      code: 'PROJ-01',
      name: 'Epson EB-X400 #1',
      status: 'AVAILABLE',
      notes: 'Unit siap pakai di TU',
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    },
    {
      id: 'prj-2',
      code: 'PROJ-02',
      name: 'Epson EB-X400 #2',
      status: 'BORROWED',
      notes: null,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
      active_loan: {
        id: 'loan-1',
        borrowed_at: '2026-11-20T08:00:00Z',
        due_at: '2026-11-20T17:00:00Z',
        student: { id: 'std-1', name: 'Keegan Mahasiswa', nim: '4223121001' },
      },
    },
    {
      id: 'prj-3',
      code: 'TEST-PROJ-003',
      name: 'Epson EB-X400 Unit UAT',
      status: 'MAINTENANCE',
      notes: 'Gangguan port HDMI setelah pengembalian bermasalah',
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-20T10:00:00Z',
    },
  ];

  beforeEach(() => {
    mockSearchParamsMap.clear();
    mockPush.mockClear();
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projectors: sampleProjectors }),
    });
  });

  it('validates whitelist filters only contains AVAILABLE and MAINTENANCE', () => {
    expect(VALID_STATUS_FILTERS).toEqual(['AVAILABLE', 'MAINTENANCE']);
  });

  describe('1. Tanpa Query Parameter (Default State)', () => {
    it('menampilkan seluruh unit aktif / non-arsip saat parameter status tidak ada', () => {
      // searchParams is empty
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, { initialProjectors: sampleProjectors })
      );

      // Seluruh 3 unit muncul
      expect(html).toContain('PROJ-01');
      expect(html).toContain('PROJ-02');
      expect(html).toContain('TEST-PROJ-003');

      // Indikator filter aktif TIDAK boleh muncul
      expect(html).not.toContain('data-testid="active-filter-indicator"');
      expect(html).not.toContain('Filter Aktif:');
    });
  });

  describe('2. Query Parameter status=AVAILABLE', () => {
    it('hanya menampilkan unit dengan status AVAILABLE dan menampilkan filter banner', () => {
      mockSearchParamsMap.set('status', 'AVAILABLE');

      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, { initialProjectors: sampleProjectors })
      );

      // Hanya unit AVAILABLE (PROJ-01) yang muncul
      expect(html).toContain('PROJ-01');
      expect(html).toContain('Epson EB-X400 #1');

      // Unit BORROWED dan MAINTENANCE tidak boleh muncul
      expect(html).not.toContain('PROJ-02');
      expect(html).not.toContain('TEST-PROJ-003');

      // Indikator filter aktif muncul dengan info yang tepat
      expect(html).toContain('data-testid="active-filter-indicator"');
      expect(html).toContain('Filter Aktif:');
      expect(html).toContain('Tersedia (AVAILABLE)');
      expect(html).toContain('(1 dari 3 unit)');

      // Tombol reset filter tersedia
      expect(html).toContain('data-testid="reset-filter-button"');
      expect(html).toContain('Tampilkan Semua Unit');
    });

    it('mendukung case-insensitivity (status=available)', () => {
      mockSearchParamsMap.set('status', 'available');

      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, { initialProjectors: sampleProjectors })
      );

      expect(html).toContain('PROJ-01');
      expect(html).not.toContain('PROJ-02');
      expect(html).not.toContain('TEST-PROJ-003');
      expect(html).toContain('Filter Aktif:');
    });
  });

  describe('3. Query Parameter status=MAINTENANCE', () => {
    it('hanya menampilkan unit dengan status MAINTENANCE dan menampilkan filter banner', () => {
      mockSearchParamsMap.set('status', 'MAINTENANCE');

      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, { initialProjectors: sampleProjectors })
      );

      // Hanya unit MAINTENANCE (TEST-PROJ-003) yang muncul
      expect(html).toContain('TEST-PROJ-003');
      expect(html).toContain('Epson EB-X400 Unit UAT');

      // Unit AVAILABLE dan BORROWED tidak boleh muncul
      expect(html).not.toContain('PROJ-01');
      expect(html).not.toContain('PROJ-02');

      // Indikator filter aktif muncul
      expect(html).toContain('data-testid="active-filter-indicator"');
      expect(html).toContain('Filter Aktif:');
      expect(html).toContain('Dalam Perawatan (MAINTENANCE)');
      expect(html).toContain('(1 dari 3 unit)');

      // Tombol reset filter tersedia
      expect(html).toContain('data-testid="reset-filter-button"');
      expect(html).toContain('Tampilkan Semua Unit');
    });
  });

  describe('4. Parameter Status Tidak Valid / Di Luar Whitelist', () => {
    it('mengabaikan status tidak dikenal dan menampilkan seluruh unit', () => {
      mockSearchParamsMap.set('status', 'UNKNOWN_STATUS_123');

      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, { initialProjectors: sampleProjectors })
      );

      // Seluruh 3 unit tetap tampil
      expect(html).toContain('PROJ-01');
      expect(html).toContain('PROJ-02');
      expect(html).toContain('TEST-PROJ-003');

      // Banner filter TIDAK muncul
      expect(html).not.toContain('data-testid="active-filter-indicator"');
    });

    it('mengabaikan status BORROWED karena hanya AVAILABLE dan MAINTENANCE yang didukung untuk filter inventaris', () => {
      mockSearchParamsMap.set('status', 'BORROWED');

      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, { initialProjectors: sampleProjectors })
      );

      // Seluruh 3 unit tetap tampil
      expect(html).toContain('PROJ-01');
      expect(html).toContain('PROJ-02');
      expect(html).toContain('TEST-PROJ-003');
      expect(html).not.toContain('data-testid="active-filter-indicator"');
    });
  });

  describe('5. Filtered Empty State', () => {
    it('menampilkan empty state khusus filter saat tidak ada unit yang cocok dengan filter status', () => {
      mockSearchParamsMap.set('status', 'MAINTENANCE');

      // Hanya ada unit AVAILABLE
      const onlyAvailable = [sampleProjectors[0]];

      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, { initialProjectors: onlyAvailable })
      );

      // Menampilkan pesan filter empty state
      expect(html).toContain('Tidak ada unit proyektor dengan status &quot;Dalam Perawatan&quot;');
      expect(html).toContain('Saat ini tidak ada unit proyektor yang sedang dalam status tersebut.');

      // Menyediakan tombol Tampilkan Semua Unit pada empty state
      expect(html).toContain('data-testid="empty-reset-filter-button"');
      expect(html).toContain('Tampilkan Semua Unit');

      // Tidak menampilkan pesan kosong umum ("Belum ada unit proyektor terdaftar")
      expect(html).not.toContain('Belum ada unit proyektor terdaftar');
    });
  });

  describe('6. Navigasi Langsung dan Refresh Halaman', () => {
    it('mempertahankan filter status saat halaman diakses langsung atau di-refresh dengan URL query param', () => {
      // Simulasikan browser me-refresh URL: /admin/projectors?status=AVAILABLE
      mockSearchParamsMap.set('status', 'AVAILABLE');

      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsPage)
      );

      // Page wrapper dengan Suspense berhasil me-render konten
      expect(html).toContain('Manajemen Inventaris Proyektor');
      expect(html).toContain('Filter Aktif:');
      expect(html).toContain('Tersedia (AVAILABLE)');
    });
  });
});
