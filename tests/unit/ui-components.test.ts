import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Modal,
  LoadingSpinner,
  EmptyState,
} from '@/components/ui';

describe('Shared UI Component Library (Fase 1)', () => {
  describe('1. LoadingSpinner', () => {
    it('renders with role="status" and default label', () => {
      const html = renderToStaticMarkup(React.createElement(LoadingSpinner));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Memuat..."');
      expect(html).toContain('animate-spin');
    });

    it('renders different sizes (sm, md, lg)', () => {
      const sm = renderToStaticMarkup(React.createElement(LoadingSpinner, { size: 'sm' }));
      const md = renderToStaticMarkup(React.createElement(LoadingSpinner, { size: 'md' }));
      const lg = renderToStaticMarkup(React.createElement(LoadingSpinner, { size: 'lg' }));

      expect(sm).toContain('h-4 w-4');
      expect(md).toContain('h-6 w-6');
      expect(lg).toContain('h-9 w-9');
    });

    it('renders different color variants', () => {
      const navy = renderToStaticMarkup(React.createElement(LoadingSpinner, { variant: 'navy' }));
      const white = renderToStaticMarkup(React.createElement(LoadingSpinner, { variant: 'white' }));

      expect(navy).toContain('border-t-navy-800');
      expect(white).toContain('border-t-white');
    });
  });

  describe('2. Button', () => {
    it('renders primary variant by default with Balanced Navy styling', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, null, 'Klik Saya')
      );
      expect(html).toContain('Klik Saya');
      expect(html).toContain('bg-navy-800');
      expect(html).toContain('text-white');
      expect(html).toContain('min-h-[44px]'); // 44px mobile touch target
    });

    it('renders all variants: secondary, outline, ghost, danger', () => {
      const secondary = renderToStaticMarkup(React.createElement(Button, { variant: 'secondary' }, 'Batal'));
      const outline = renderToStaticMarkup(React.createElement(Button, { variant: 'outline' }, 'Detail'));
      const ghost = renderToStaticMarkup(React.createElement(Button, { variant: 'ghost' }, 'Tutup'));
      const danger = renderToStaticMarkup(React.createElement(Button, { variant: 'danger' }, 'Hapus'));

      expect(secondary).toContain('bg-brand-soft');
      expect(outline).toContain('border-borderline');
      expect(ghost).toContain('bg-transparent');
      expect(danger).toContain('bg-rose-600');
    });

    it('renders sizes sm, md, lg', () => {
      const sm = renderToStaticMarkup(React.createElement(Button, { size: 'sm' }, 'Kecil'));
      const lg = renderToStaticMarkup(React.createElement(Button, { size: 'lg' }, 'Besar'));

      expect(sm).toContain('min-h-[36px]');
      expect(lg).toContain('min-h-[48px]');
    });

    it('handles loading state with spinner and loadingText', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, { isLoading: true, loadingText: 'Menyimpan...' }, 'Simpan')
      );
      expect(html).toContain('role="status"');
      expect(html).toContain('Menyimpan...');
      expect(html).toContain('disabled=""');
      expect(html).toContain('aria-busy="true"');
    });

    it('handles disabled state', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, { disabled: true }, 'Dinonaktifkan')
      );
      expect(html).toContain('disabled=""');
      expect(html).toContain('disabled:opacity-50');
    });

    it('renders left and right icons', () => {
      const leftIcon = React.createElement('span', { 'data-testid': 'left-icon' }, '←');
      const rightIcon = React.createElement('span', { 'data-testid': 'right-icon' }, '→');
      const html = renderToStaticMarkup(
        React.createElement(Button, { leftIcon, rightIcon }, 'Navigasi')
      );
      expect(html).toContain('data-testid="left-icon"');
      expect(html).toContain('data-testid="right-icon"');
      expect(html).toContain('Navigasi');
    });
  });

  describe('3. Input', () => {
    it('renders label, input, and placeholder with accessible htmlFor', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          id: 'nim-input',
          label: 'Nomor Induk Mahasiswa',
          placeholder: 'Contoh: 4223121001',
          required: true,
        })
      );
      expect(html).toContain('for="nim-input"');
      expect(html).toContain('id="nim-input"');
      expect(html).toContain('Nomor Induk Mahasiswa');
      expect(html).toContain('*'); // required indicator
      expect(html).toContain('placeholder="Contoh: 4223121001"');
      expect(html).toContain('min-h-[44px]');
    });

    it('renders error message and sets aria-invalid="true"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          id: 'email-input',
          label: 'Email',
          error: 'Format email tidak valid',
        })
      );
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Format email tidak valid');
      expect(html).toContain('border-rose-400');
    });

    it('renders helperText when no error is present', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          id: 'unit-code',
          label: 'Kode Unit',
          helperText: 'Lihat stiker aset pada bodi proyektor',
        })
      );
      expect(html).toContain('Lihat stiker aset pada bodi proyektor');
      expect(html).toContain('aria-describedby="unit-code-helper"');
    });

    it('renders left and right icons with appropriate padding', () => {
      const leftIcon = React.createElement('span', { 'data-testid': 'search-icon' }, '🔍');
      const html = renderToStaticMarkup(
        React.createElement(Input, { leftIcon, placeholder: 'Cari...' })
      );
      expect(html).toContain('data-testid="search-icon"');
      expect(html).toContain('pl-10');
    });
  });

  describe('4. Card', () => {
    it('renders card container with default styling and padding', () => {
      const html = renderToStaticMarkup(
        React.createElement(Card, null, React.createElement('p', null, 'Konten Kartu'))
      );
      expect(html).toContain('rounded-card');
      expect(html).toContain('bg-surface');
      expect(html).toContain('border-borderline');
      expect(html).toContain('p-5 sm:p-6');
      expect(html).toContain('Konten Kartu');
    });

    it('renders subcomponents: CardHeader, CardTitle, CardDescription, CardContent, CardFooter', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          Card,
          null,
          React.createElement(CardHeader, {
            title: 'Inventaris Proyektor',
            description: 'Daftar unit fisik',
          }),
          React.createElement(CardContent, null, 'Isi Konten'),
          React.createElement(CardFooter, null, React.createElement('button', null, 'Aksi'))
        )
      );
      expect(html).toContain('Inventaris Proyektor');
      expect(html).toContain('Daftar unit fisik');
      expect(html).toContain('Isi Konten');
      expect(html).toContain('Aksi');
    });

    it('supports variants: interactive and accent', () => {
      const interactive = renderToStaticMarkup(React.createElement(Card, { variant: 'interactive' }));
      const accent = renderToStaticMarkup(React.createElement(Card, { variant: 'accent' }));

      expect(interactive).toContain('hover:shadow-md');
      expect(accent).toContain('bg-gradient-to-br');
    });
  });

  describe('5. Badge', () => {
    it('renders badge with primary, success, warning, danger variants', () => {
      const primary = renderToStaticMarkup(React.createElement(Badge, { variant: 'primary' }, 'Aktif'));
      const success = renderToStaticMarkup(React.createElement(Badge, { variant: 'success' }, 'Tersedia'));
      const warning = renderToStaticMarkup(React.createElement(Badge, { variant: 'warning' }, 'Perawatan'));
      const danger = renderToStaticMarkup(React.createElement(Badge, { variant: 'danger' }, 'Terlambat'));

      expect(primary).toContain('bg-navy-50 text-navy-800');
      expect(success).toContain('bg-emerald-50 text-emerald-800');
      expect(warning).toContain('bg-amber-50 text-amber-800');
      expect(danger).toContain('bg-rose-50 text-rose-800');
    });

    it('auto-resolves PINJAM domain statuses to proper variants and labels', () => {
      const available = renderToStaticMarkup(React.createElement(Badge, { status: 'AVAILABLE' }));
      const borrowed = renderToStaticMarkup(React.createElement(Badge, { status: 'BORROWED' }));
      const maintenance = renderToStaticMarkup(React.createElement(Badge, { status: 'MAINTENANCE' }));
      const overdue = renderToStaticMarkup(React.createElement(Badge, { status: 'OVERDUE' }));
      const reportedIssue = renderToStaticMarkup(React.createElement(Badge, { status: 'REPORTED_ISSUE' }));

      expect(available).toContain('Tersedia');
      expect(available).toContain('bg-emerald-50');

      expect(borrowed).toContain('Dipinjam');
      expect(borrowed).toContain('bg-navy-50');

      expect(maintenance).toContain('Perawatan');
      expect(maintenance).toContain('bg-amber-50');

      expect(overdue).toContain('Terlambat');
      expect(overdue).toContain('bg-rose-50');

      expect(reportedIssue).toContain('Ada Kendala');
      expect(reportedIssue).toContain('bg-amber-50');
    });

    it('renders indicator dot when dot=true', () => {
      const html = renderToStaticMarkup(
        React.createElement(Badge, { status: 'ACTIVE', dot: true })
      );
      expect(html).toContain('h-1.5 w-1.5 rounded-full');
      expect(html).toContain('bg-navy-800');
    });
  });

  describe('6. Modal', () => {
    it('returns null when isOpen=false', () => {
      const html = renderToStaticMarkup(
        React.createElement(Modal, { isOpen: false, onClose: () => {} }, 'Konten')
      );
      expect(html).toBe('');
    });

    it('renders modal dialog when isOpen=true with accessibility attributes', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          Modal,
          {
            isOpen: true,
            onClose: () => {},
            title: 'Judul Modal',
            description: 'Deskripsi detail dialog',
            footer: React.createElement('button', null, 'Simpan'),
          },
          React.createElement('p', null, 'Konten Form')
        )
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('Judul Modal');
      expect(html).toContain('Deskripsi detail dialog');
      expect(html).toContain('Konten Form');
      expect(html).toContain('Simpan');
      expect(html).toContain('aria-label="Tutup dialog"');
      expect(html).toContain('backdrop-blur-sm');
    });

    it('supports modal size variants (sm, md, lg, xl)', () => {
      const sm = renderToStaticMarkup(
        React.createElement(Modal, { isOpen: true, onClose: () => {}, size: 'sm' }, 'Isi')
      );
      const xl = renderToStaticMarkup(
        React.createElement(Modal, { isOpen: true, onClose: () => {}, size: 'xl' }, 'Isi')
      );

      expect(sm).toContain('max-w-md');
      expect(xl).toContain('max-w-4xl');
    });
  });

  describe('7. EmptyState', () => {
    it('renders title, description, and optional action button', () => {
      const action = React.createElement(Button, { size: 'sm' }, 'Tambah Data');
      const html = renderToStaticMarkup(
        React.createElement(EmptyState, {
          title: 'Tidak ada transaksi',
          description: 'Belum ada riwayat peminjaman yang tercatat.',
          action,
        })
      );

      expect(html).toContain('Tidak ada transaksi');
      expect(html).toContain('Belum ada riwayat peminjaman yang tercatat.');
      expect(html).toContain('Tambah Data');
      expect(html).toContain('bg-brand-soft'); // icon background circle
    });
  });
});
