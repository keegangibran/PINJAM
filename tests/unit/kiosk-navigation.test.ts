import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminDashboardPage from '@/app/admin/page';
import KioskPage from '@/app/kiosk/page';

// Mocks
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/kiosk/QrScannerBox', () => ({
  default: React.forwardRef(() => React.createElement('div', { 'data-testid': 'mock-qr-scanner' })),
}));

describe('Kiosk Navigation & Fullscreen UI Tests', () => {
  it('1. Admin Dashboard renders "Buka Kiosk" with target="_blank" and rel="noopener noreferrer"', () => {
    const html = renderToStaticMarkup(React.createElement(AdminDashboardPage));

    expect(html).toContain('Buka Kiosk');
    expect(html).toContain('href="/kiosk"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('title="Buka antarmuka pemindaian Kiosk meja TU"');
  });

  it('2. Kiosk page DOES NOT render any link to "/admin" or "Panel Admin"', () => {
    const html = renderToStaticMarkup(React.createElement(KioskPage));

    expect(html).not.toContain('href="/admin"');
    expect(html).not.toContain('Panel Admin');
  });

  it('3. Kiosk page renders Fullscreen toggle button with appropriate title and label', () => {
    const html = renderToStaticMarkup(React.createElement(KioskPage));

    expect(html).toContain('Layar Penuh');
    expect(html).toContain('Monitor Kedua');
  });
});
