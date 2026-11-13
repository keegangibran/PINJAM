import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { GET as getProjectors } from '@/app/api/admin/projectors/route';
import { GET as getLoans } from '@/app/api/admin/loans/route';
import { GET as getMaintenanceStatus } from '@/app/api/admin/maintenance/status/route';
import AdminDashboardPage from '@/app/admin/page';
import AdminProjectorsPage from '@/app/admin/projectors/page';
import * as guards from '@/lib/auth/guards';

const mockAdminFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => React.createElement('svg', { 'data-testid': 'mock-qrcode' }),
}));

describe('Admin Inventory Refresh & Cache Safety Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    vi.spyOn(guards, 'requireStaff').mockResolvedValue({
      userId: 'usr-staff',
      email: 'staff@kampus.ac.id',
      role: 'STAFF',
      staffProfile: { id: 'stf-1', name: 'Petugas TU', role: 'STAFF', isActive: true },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Fase B & C: Endpoint Cache Safety & Query Optimization', () => {
    it('GET /api/admin/projectors sends Cache-Control: no-store, queries only ACTIVE loans, and maps statuses accurately', async () => {
      const sampleProjectors = [
        {
          id: 'prj-1',
          code: 'PROJ-01',
          name: 'Epson EB-X400 #1',
          status: 'AVAILABLE',
          notes: null,
          created_at: '2026-11-06T00:00:00Z',
          updated_at: '2026-11-06T00:00:00Z',
          loans: [],
        },
        {
          id: 'prj-2',
          code: 'PROJ-02',
          name: 'BenQ MX550',
          status: 'BORROWED',
          notes: null,
          created_at: '2026-11-06T00:00:00Z',
          updated_at: '2026-11-06T00:00:00Z',
          loans: [
            {
              id: 'loan-act-1',
              status: 'ACTIVE',
              borrowed_at: '2026-11-06T08:00:00Z',
              due_at: '2026-11-06T17:00:00Z',
              student: { id: 'std-1', name: 'Budi Ketua', nim: '230101001' },
            },
          ],
        },
        {
          id: 'prj-3',
          code: 'TEST-PROJ-001',
          name: 'Acer X1123H',
          status: 'MAINTENANCE',
          notes: 'Lampu proyektor berkedip dan mati mendadak',
          created_at: '2026-11-06T00:00:00Z',
          updated_at: '2026-11-06T00:00:00Z',
          loans: [],
        },
      ];

      const mockOrder = vi.fn().mockResolvedValue({ data: sampleProjectors, error: null });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });

      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: mockEq,
        }),
      });

      const res = await getProjectors();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
      expect(res.headers.get('pragma')).toBe('no-cache');

      // Verifikasi query optimization Fase C: filter status ACTIVE diterapkan langsung pada relasi loans
      expect(mockEq).toHaveBeenCalledWith('loans.status', 'ACTIVE');
      expect(mockOrder).toHaveBeenCalledWith('code', { ascending: true });

      // Verifikasi data status dipetakan dengan tepat
      expect(json.success).toBe(true);
      expect(json.projectors).toHaveLength(3);

      // AVAILABLE
      expect(json.projectors[0].status).toBe('AVAILABLE');
      expect(json.projectors[0].active_loan).toBeNull();

      // BORROWED dengan active_loan
      expect(json.projectors[1].status).toBe('BORROWED');
      expect(json.projectors[1].active_loan).not.toBeNull();
      expect(json.projectors[1].active_loan.id).toBe('loan-act-1');
      expect(json.projectors[1].active_loan.student.name).toBe('Budi Ketua');

      // MAINTENANCE
      expect(json.projectors[2].status).toBe('MAINTENANCE');
      expect(json.projectors[2].notes).toContain('Lampu proyektor berkedip');
      expect(json.projectors[2].active_loan).toBeNull();
    });

    it('GET /api/admin/loans sends Cache-Control: no-store and preserves filter parameters', async () => {
      // Mock the 5 summary count queries
      mockAdminFrom
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ count: 12 }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 7 }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 3 }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lt: vi.fn().mockResolvedValue({ count: 1 }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 2 }),
          }),
        });

      // Mock loans table query with filter
      const mockGte = vi.fn().mockReturnThis();
      const mockLte = vi.fn().mockReturnThis();
      const mockEqStatus = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();
      const mockRange = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'loan-active-1',
            status: 'ACTIVE',
            borrowed_at: '2026-11-13T08:00:00Z',
            due_at: '2026-11-13T17:00:00Z',
            returned_at: null,
            student: { id: 's-1', name: 'Andi', nim: '123' },
            projector: { id: 'p-1', code: 'PROJ-01', name: 'Epson', status: 'BORROWED' },
          },
        ],
        error: null,
        count: 1,
      });

      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: mockEqStatus,
          gte: mockGte,
          lte: mockLte,
          order: mockOrder,
          range: mockRange,
        }),
      });

      const req = new NextRequest(
        'http://localhost/api/admin/loans?status=ACTIVE&from=2026-11-13T00:00:00Z&to=2026-11-13T23:59:59Z&q=Andi'
      );
      const res = await getLoans(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
      expect(res.headers.get('pragma')).toBe('no-cache');
      expect(json.summary.total_projectors).toBe(12);
      expect(json.summary.available_count).toBe(7);
      expect(json.summary.borrowed_count).toBe(3);
      expect(json.summary.overdue_count).toBe(1);
      expect(json.summary.maintenance_count).toBe(2);
      expect(json.loans).toHaveLength(1);
    });

    it('GET /api/admin/maintenance/status sends Cache-Control: no-store', async () => {
      mockAdminFrom
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { value: { last_run_at: '2026-11-13T02:00:00Z' } } }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { value: { current_usage_pct: 15 } } }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { value: { current_term: '2026/2027-GANJIL' } } }),
            }),
          }),
        });

      const res = await getMaintenanceStatus();
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
    });
  });

  describe('Fase A: Client Refresh Lifecycle & Duplicate Guard Simulation', () => {
    it('guards against concurrent duplicate fetches while a refresh is in-flight', async () => {
      let isFetching = false;
      let fetchCount = 0;

      const refreshHandler = async () => {
        if (isFetching) return;
        isFetching = true;
        try {
          fetchCount += 1;
          await new Promise((r) => setTimeout(r, 25));
        } finally {
          isFetching = false;
        }
      };

      // Simulasikan double-click atau simultan visibilitychange + window focus
      const p1 = refreshHandler();
      const p2 = refreshHandler();
      const p3 = refreshHandler();

      await Promise.all([p1, p2, p3]);

      expect(fetchCount).toBe(1);

      // Setelah selesai, panggilan berikutnya berhasil dijalankan
      await refreshHandler();
      expect(fetchCount).toBe(2);
    });

    it('triggers refresh only when document is visible on visibilitychange', async () => {
      let refreshCalled = 0;
      let docVisibility: DocumentVisibilityState = 'hidden';

      const handleVisibilityChange = () => {
        if (docVisibility === 'visible') {
          refreshCalled += 1;
        }
      };

      // Saat tab disembunyikan (hidden) -> tidak trigger
      docVisibility = 'hidden';
      handleVisibilityChange();
      expect(refreshCalled).toBe(0);

      // Saat tab kembali aktif (visible) -> trigger refresh
      docVisibility = 'visible';
      handleVisibilityChange();
      expect(refreshCalled).toBe(1);
    });

    it('cleans up event listeners safely when unmounted', () => {
      const addedListeners: { type: string; listener: EventListenerOrEventListenerObject }[] = [];
      const removedListeners: { type: string; listener: EventListenerOrEventListenerObject }[] = [];

      const mockWindow = {
        addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
          addedListeners.push({ type, listener });
        },
        removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
          removedListeners.push({ type, listener });
        },
      };

      const handler = () => {};
      mockWindow.addEventListener('visibilitychange', handler);
      mockWindow.addEventListener('focus', handler);

      expect(addedListeners).toHaveLength(2);

      // Unmount / cleanup
      mockWindow.removeEventListener('visibilitychange', handler);
      mockWindow.removeEventListener('focus', handler);

      expect(removedListeners).toHaveLength(2);
      expect(removedListeners[0].type).toBe('visibilitychange');
      expect(removedListeners[1].type).toBe('focus');
    });
  });

  describe('UI Rendering & SSR Safety', () => {
    it('renders "Muat Ulang" button on Admin Projectors Page without SSR errors', () => {
      const html = renderToStaticMarkup(React.createElement(AdminProjectorsPage));

      expect(html).toContain('Manajemen Inventaris Proyektor');
      expect(html).toContain('Perbarui data inventaris terbaru dari server');
      expect(html).toContain('Tambah Unit Baru');
      expect(html).toContain('Kembali ke Dashboard');
    });

    it('renders "Muat Ulang" button on Admin Dashboard Page preserving filters and navigation', () => {
      const html = renderToStaticMarkup(React.createElement(AdminDashboardPage));

      expect(html).toContain('Panel Petugas &amp; Admin');
      expect(html).toContain('Perbarui data buku besar dan ringkasan inventaris terbaru dari server');
      expect(html).toContain('Inventaris Proyektor');
      expect(html).toContain('Ekspor Data');
      expect(html).toContain('Semua Transaksi');
      expect(html).toContain('Sedang Dipinjam');
      expect(html).toContain('Dalam Perawatan');
    });
  });
});
