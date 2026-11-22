import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MyQrPassPage from '@/app/(student)/my-qr/page';
import ClaimClassModal, { ClassOption } from '@/components/student/ClaimClassModal';

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
}));

describe('New-Term Class Claim UI (FR-01F / GAP-01)', () => {
  const pageSourcePath = path.resolve(process.cwd(), 'src/app/(student)/my-qr/page.tsx');
  const pageSource = fs.readFileSync(pageSourcePath, 'utf-8');

  const modalSourcePath = path.resolve(process.cwd(), 'src/components/student/ClaimClassModal.tsx');
  const modalSource = fs.readFileSync(modalSourcePath, 'utf-8');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Static Code Analysis & Contract Verification (FR-01F)', () => {
    it('memiliki antarmuka dan pemanggilan API claim di /api/students/me/leader/claim', () => {
      expect(pageSource).toContain('/api/students/me/leader/claim');
      expect(pageSource).toContain('fetchClaimStatus');
      expect(pageSource).toContain('handleOpenClaimModal');
      expect(pageSource).toContain('handleExecuteClaim');
    });

    it('memiliki integrasi modal ClaimClassModal dengan daftar kelas dari /api/classes', () => {
      expect(pageSource).toContain('/api/classes');
      expect(pageSource).toContain('ClaimClassModal');
      expect(pageSource).toContain('availableClasses');
      expect(pageSource).toContain('selectedClassId');
    });

    it('memiliki checkbox konfirmasi keabsahan / consent sebelum submit (PRD FR-01F)', () => {
      expect(modalSource).toContain('claimConsentConfirmed');
      expect(modalSource).toContain('Saya menyatakan secara jujur bahwa saya adalah ketua kelas yang sah');
    });

    it('menyediakan tombol aksi Klaim Semester Baru di kartu aktif QR dan halaman error status', () => {
      expect(pageSource).toContain('Klaim Semester Baru (FR-01F)');
      expect(pageSource).toContain('Ajukan Klaim Ketua Kelas Semester Baru');
      expect(pageSource).toContain('Pilih & Klaim Kelas Akademik');
    });

    it('menampilkan status permohonan tertunda (pending claim) jika mahasiswa sudah mengajukan', () => {
      expect(pageSource).toContain('Permohonan Klaim Sedang Ditinjau Petugas');
      expect(pageSource).toContain('Menunggu Verifikasi TU');
      expect(pageSource).toContain('pendingClaim');
    });
  });

  describe('2. MyQrPassPage Initial Render', () => {
    it('merender default loading spinner dan teks awal tanpa crash', () => {
      const html = renderToStaticMarkup(React.createElement(MyQrPassPage));
      expect(html).toContain('PINJAM Pass');
      expect(html).toContain('Menghasilkan QR Pass aman...');
    });
  });

  describe('3. ClaimClassModal Component Tests', () => {
    const mockClasses: ClassOption[] = [
      {
        id: 'cls-1',
        study_program: 'Teknik Informatika',
        cohort_year: 2024,
        section: 'A',
        academic_term: '2025/2026 Ganjil',
      },
      {
        id: 'cls-2',
        study_program: 'Sistem Informasi',
        cohort_year: 2024,
        section: 'B',
        academic_term: '2025/2026 Ganjil',
      },
    ];

    const defaultProps = {
      isOpen: true,
      onClose: vi.fn(),
      availableClasses: mockClasses,
      loadingClasses: false,
      selectedClassId: 'cls-1',
      onSelectClassId: vi.fn(),
      claimNotes: '',
      onChangeNotes: vi.fn(),
      claimConsentConfirmed: false,
      onToggleConsent: vi.fn(),
      isSubmittingClaim: false,
      claimError: null,
      claimSuccess: false,
      claimSuccessMessage: null,
      onSubmit: vi.fn(),
    };

    it('tidak merender apapun saat isOpen = false', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimClassModal, { ...defaultProps, isOpen: false })
      );
      expect(html).toBe('');
    });

    it('merender modal form klaim semester baru secara lengkap saat isOpen = true', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimClassModal, defaultProps)
      );
      expect(html).toContain('Klaim Ketua Kelas Semester Baru');
      expect(html).toContain('Mahasiswa aktif tidak perlu mengunggah ulang foto identitas (FR-01F)');
      expect(html).toContain('Teknik Informatika (2024 - A) • 2025/2026 Ganjil');
      expect(html).toContain('Sistem Informasi (2024 - B) • 2025/2026 Ganjil');
      expect(html).toContain('Saya menyatakan secara jujur bahwa saya adalah ketua kelas yang sah');
      expect(html).toContain('Kirim Permohonan Klaim');
      expect(html).toContain('Batal');
    });

    it('menampilkan preview detail kelas yang sedang dipilih', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimClassModal, defaultProps)
      );
      expect(html).toContain('Teknik Informatika');
      expect(html).toContain('2024 - A');
      expect(html).toContain('2025/2026 Ganjil');
    });

    it('menampilkan skeleton loading saat loadingClasses = true', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimClassModal, { ...defaultProps, loadingClasses: true })
      );
      expect(html).toContain('Memuat daftar kelas aktif...');
    });

    it('menampilkan peringatan jika tidak ada kelas aktif yang tersedia', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimClassModal, {
          ...defaultProps,
          availableClasses: [],
          selectedClassId: '',
        })
      );
      expect(html).toContain('Tidak ada kelas aktif yang tersedia untuk diklaim. Hubungi staf TU.');
    });

    it('menampilkan banner pesan error dengan role="alert" saat claimError ada', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimClassModal, {
          ...defaultProps,
          claimError: 'Kelas ini sudah memiliki ketua kelas aktif.',
        })
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain('Kelas ini sudah memiliki ketua kelas aktif.');
    });

    it('menonaktifkan tombol submit (disabled) jika persetujuan belum dicentang', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimClassModal, {
          ...defaultProps,
          claimConsentConfirmed: false,
        })
      );
      const submitBtnMatch = html.match(/<button[^>]*>[\s\S]*?Kirim Permohonan Klaim[\s\S]*?<\/button>/);
      expect(submitBtnMatch).not.toBeNull();
      expect(submitBtnMatch![0]).toContain('disabled=""');
    });

    it('mengaktifkan tombol submit jika kelas terpilih dan persetujuan dicentang', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimClassModal, {
          ...defaultProps,
          selectedClassId: 'cls-1',
          claimConsentConfirmed: true,
        })
      );
      const submitBtnMatch = html.match(/<button[^>]*>[\s\S]*?Kirim Permohonan Klaim[\s\S]*?<\/button>/);
      expect(submitBtnMatch).not.toBeNull();
      expect(submitBtnMatch![0]).not.toContain('disabled=""');
    });

    it('menampilkan teks "Mengirim..." saat isSubmittingClaim = true', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimClassModal, {
          ...defaultProps,
          isSubmittingClaim: true,
          claimConsentConfirmed: true,
        })
      );
      expect(html).toContain('Mengirim...');
    });

    it('menampilkan status sukses dan petunjuk tindak lanjut saat claimSuccess = true', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimClassModal, {
          ...defaultProps,
          claimSuccess: true,
          claimSuccessMessage: 'Permohonan klaim ketua kelas berhasil dicatat.',
        })
      );
      expect(html).toContain('Permohonan Klaim Berhasil Dikirim!');
      expect(html).toContain('Permohonan klaim ketua kelas berhasil dicatat.');
      expect(html).toContain('Petugas TU akan meninjau dan memverifikasi permohonan di dashboard admin.');
      expect(html).toContain('Tutup &amp; Kembali');
    });
  });
});
