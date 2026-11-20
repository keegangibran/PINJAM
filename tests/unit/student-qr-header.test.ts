import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MyQrPassPage from '@/app/(student)/my-qr/page';
import StudentQrLoading from '@/app/(student)/my-qr/loading';

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

describe('PINJAM Pass Student Header (src/app/(student)/my-qr/page.tsx)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Header Navigation & Brand Identity', () => {
    it('menampilkan brand badge dan judul "PINJAM Pass"', () => {
      const html = renderToStaticMarkup(React.createElement(MyQrPassPage));
      expect(html).toContain('PINJAM Pass');
      expect(html).toContain('animate-ping');
      expect(html).toContain('bg-emerald-500');
    });

    it('TIDAK lagi menampilkan tombol atau teks "Beranda"', () => {
      const html = renderToStaticMarkup(React.createElement(MyQrPassPage));
      expect(html).not.toContain('Beranda');
    });

    it('TIDAK lagi memiliki tautan navigasi href="/" pada header', () => {
      const html = renderToStaticMarkup(React.createElement(MyQrPassPage));
      expect(html).not.toContain('href="/"');
    });

    it('tetap menampilkan tombol "Keluar" dengan styling dan status yang benar', () => {
      const html = renderToStaticMarkup(React.createElement(MyQrPassPage));
      expect(html).toContain('Keluar');
      expect(html).toContain('text-red-600');
    });
  });

  describe('2. Loading Skeleton Header Alignment (src/app/(student)/my-qr/loading.tsx)', () => {
    it('menampilkan skeleton brand "PINJAM Pass"', () => {
      const html = renderToStaticMarkup(React.createElement(StudentQrLoading));
      expect(html).toContain('PINJAM Pass');
      expect(html).toContain('role="status"');
    });

    it('hanya me-render satu placeholder skeleton pill untuk tombol Keluar', () => {
      const html = renderToStaticMarkup(React.createElement(StudentQrLoading));
      // Hitung jumlah elemen placeholder skeleton pill 'h-6 w-14' pada header
      const headerPillMatches = html.match(/h-6 w-14 bg-slate-100 rounded-lg animate-pulse/g);
      expect(headerPillMatches).not.toBeNull();
      expect(headerPillMatches?.length).toBe(1);
    });

    it('tidak memuat teks "Beranda" atau link href="/" dalam skeleton', () => {
      const html = renderToStaticMarkup(React.createElement(StudentQrLoading));
      expect(html).not.toContain('Beranda');
      expect(html).not.toContain('href="/"');
    });
  });
});
