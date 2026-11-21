import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AdminProjectorsContent,
  ProjectorItem,
  StatusLog,
} from '@/components/admin/ProjectorsInventoryView';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

describe('Admin Projectors 5 Shared Modals Tests (PINJAM Fase 3.1 Langkah 3)', () => {
  const sampleProjectorAvailable: ProjectorItem = {
    id: 'prj-1',
    code: 'PROJ-01',
    name: 'Epson EB-X400 #1',
    status: 'AVAILABLE',
    notes: 'Unit siap pakai di TU',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  };

  const sampleProjectorBorrowed: ProjectorItem = {
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
  };

  const sampleProjectorMaintenance: ProjectorItem = {
    id: 'prj-3',
    code: 'TEST-PROJ-003',
    name: 'Epson EB-X400 Unit UAT',
    status: 'MAINTENANCE',
    notes: 'Port HDMI longgar',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
  };

  const sampleLogs: StatusLog[] = [
    {
      id: 'log-1',
      from_status: 'AVAILABLE',
      to_status: 'MAINTENANCE',
      reason: 'Kabel power longgar dan kipas berisik',
      photo_path: 'loans/maintenance_1.jpg',
      created_at: '2026-11-20T10:00:00Z',
      staff: { id: 'stf-1', name: 'Petugas TU', role: 'STAFF' },
    },
    {
      id: 'log-2',
      from_status: 'MAINTENANCE',
      to_status: 'AVAILABLE',
      reason: 'Kabel power diganti baru dan unit telah diuji normal',
      photo_path: null,
      created_at: '2026-11-21T08:00:00Z',
      staff: { id: 'stf-admin', name: 'Admin Utama', role: 'ADMIN' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projectors: [sampleProjectorAvailable] }),
    });
  });

  describe('1. Default State (Seluruh Modal Tertutup)', () => {
    it('tidak me-render satupun dari kelima modal saat seluruh modal tertutup', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, {
          initialProjectors: [sampleProjectorAvailable],
        })
      );

      // Dialog container tidak boleh ada
      expect(html).not.toContain('role="dialog"');
      expect(html).not.toContain('Tambah Unit Proyektor Baru');
      expect(html).not.toContain('Kelola Unit Proyektor');
      expect(html).not.toContain('Lapor Perawatan / Kerusakan Unit');
      expect(html).not.toContain('Riwayat Perubahan Status');
      expect(html).not.toContain('Stiker QR Aset Proyektor');
    });
  });

  describe('2. Modal 1 — Tambah Unit Proyektor', () => {
    it('berhasil me-render shared Modal Tambah Unit dengan form dan focusable elements', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, {
          initialProjectors: [sampleProjectorAvailable],
          initialAddModalOpen: true,
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('Tambah Unit Proyektor Baru');
      expect(html).toContain('Daftarkan unit fisik proyektor baru ke dalam inventaris aset kampus.');
      expect(html).toContain('Kode Proyektor (Unik, mis. PROJ-01)');
      expect(html).toContain('Nama / Tipe Proyektor');
      expect(html).toContain('Catatan Tambahan (Opsional)');
      expect(html).toContain('Batal');
      expect(html).toContain('Simpan Unit');
    });
  });

  describe('3. Modal 2 — Kelola / Nonaktifkan Unit Proyektor', () => {
    it('me-render modal kelola unit dengan data unit yang diedit', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, {
          initialProjectors: [sampleProjectorAvailable],
          initialEditingProjector: sampleProjectorAvailable,
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('Kelola Unit Proyektor');
      expect(html).toContain('Kode Aset: PROJ-01');
      expect(html).toContain('value="Epson EB-X400 #1"');
      expect(html).toContain('Status Keaktifan Aset');
      expect(html).toContain('Simpan Perubahan');
    });

    it('menonaktifkan toggle nonaktif dan menampilkan peringatan jika unit sedang dipinjam (BORROWED)', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, {
          initialProjectors: [sampleProjectorBorrowed],
          initialEditingProjector: sampleProjectorBorrowed,
        })
      );

      expect(html).toContain('Kelola Unit Proyektor');
      expect(html).toContain('Kode Aset: PROJ-02');
      expect(html).toContain('Unit sedang dipinjam dan tidak dapat dinonaktifkan.');
      expect(html).toContain('disabled=""');
    });
  });

  describe('4. Modal 3 — Status Pemeliharaan (Maintenance)', () => {
    it('me-render judul Lapor Perawatan saat status proyektor AVAILABLE', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, {
          initialProjectors: [sampleProjectorAvailable],
          initialStatusProjector: sampleProjectorAvailable,
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('Lapor Perawatan / Kerusakan Unit');
      expect(html).toContain('PROJ-01 — Epson EB-X400 #1');
      expect(html).toContain('Status Baru:');
      expect(html).toContain('Tersedia (Siap Pakai)');
      expect(html).toContain('Dalam Perawatan');
      expect(html).toContain('Alasan Perubahan Status');
      expect(html).toContain('Foto Dokumentasi Kendala (Opsional, max 250 KB)');
      expect(html).toContain('Perbarui Status');
    });

    it('me-render judul Kembalikan Unit ke Siap Pakai saat status proyektor MAINTENANCE', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, {
          initialProjectors: [sampleProjectorMaintenance],
          initialStatusProjector: sampleProjectorMaintenance,
        })
      );

      expect(html).toContain('Kembalikan Unit ke Siap Pakai');
      expect(html).toContain('TEST-PROJ-003 — Epson EB-X400 Unit UAT');
    });
  });

  describe('5. Modal 4 — Riwayat Status Proyektor', () => {
    it('me-render log timeline transisi status dan staf pemroses', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, {
          initialProjectors: [sampleProjectorAvailable],
          initialHistoryProjector: sampleProjectorAvailable,
          initialLogs: sampleLogs,
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('Riwayat Perubahan Status');
      expect(html).toContain('PROJ-01 — Epson EB-X400 #1');
      expect(html).toContain('AVAILABLE');
      expect(html).toContain('MAINTENANCE');
      expect(html).toContain('Kabel power longgar dan kipas berisik');
      expect(html).toContain('Petugas TU');
      expect(html).toContain('Admin Utama');
      expect(html).toContain('Tutup');
    });

    it('me-render empty state riwayat jika belum ada log', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, {
          initialProjectors: [sampleProjectorAvailable],
          initialHistoryProjector: sampleProjectorAvailable,
          initialLogs: [],
        })
      );

      expect(html).toContain('Belum ada riwayat');
      expect(html).toContain('Belum ada riwayat perubahan status untuk unit proyektor ini.');
    });
  });

  describe('6. Modal 5 — Cetak Stiker QR & Print Invariant', () => {
    it('me-render stiker QR aset dengan ID printable-qr-tag dan konfigurasi cetak lengkap', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, {
          initialProjectors: [sampleProjectorAvailable],
          initialQrPrintProjector: sampleProjectorAvailable,
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('Stiker QR Aset Proyektor');
      expect(html).toContain('id="printable-qr-tag"');
      expect(html).toContain('PINJAM ASSET TAG');
      expect(html).toContain('PROJ-01');
      expect(html).toContain('Epson EB-X400 #1');
      expect(html).toContain('Cetak Stiker');
      expect(html).toContain('Tutup');
    });

    it('memiliki CSS print isolation invariant yang menyembunyikan elemen non-stiker saat cetak', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminProjectorsContent, {
          initialProjectors: [sampleProjectorAvailable],
          initialQrPrintProjector: sampleProjectorAvailable,
        })
      );

      // Verifikasi CSS print rules ter-embed
      expect(html).toContain('@media print');
      expect(html).toContain('body *');
      expect(html).toContain('visibility: hidden !important');
      expect(html).toContain('#printable-qr-tag');
      expect(html).toContain('visibility: visible !important');
      expect(html).toContain('print:hidden');
    });
  });
});
