import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getLoans } from '@/app/api/admin/loans/route';
import * as guards from '@/lib/auth/guards';

const mockAdminFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

describe('Admin Loans Ledger API (GET /api/admin/loans)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.QR_TOKEN_SECRET = 'test-secret-that-is-at-least-32-chars-long';

    vi.spyOn(guards, 'requireStaff').mockResolvedValue({
      userId: 'usr-staff-1',
      email: 'staff@kampus.ac.id',
      role: 'STAFF',
      staffProfile: { id: 'stf-1', name: 'Petugas TU', role: 'STAFF', isActive: true },
    });
  });

  it('rejects unauthenticated or non-staff caller', async () => {
    vi.spyOn(guards, 'requireStaff').mockRejectedValueOnce(
      new guards.AuthError('Akses ditolak: Operasi ini memerlukan hak akses Petugas TU atau Administrator.', 403, 'FORBIDDEN')
    );

    const req = new NextRequest('http://localhost/api/admin/loans');
    const res = await getLoans(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error.code).toBe('UNAUTHORIZED_OR_ERROR');
  });

  it('computes real-time inventory and overdue summary counts and returns loans list', async () => {
    // Mock the 5 count queries
    mockAdminFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          neq: vi.fn().mockResolvedValue({ count: 10 }),
        }),
      }) // total
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 6 }),
        }),
      }) // available
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 3 }),
        }),
      }) // borrowed
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ count: 1 }),
          }),
        }),
      }) // overdue
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 1 }),
        }),
      }); // maintenance

    // Mock loans query
    const sampleLoans = [
      {
        id: 'loan-1',
        borrowed_at: '2026-11-06T08:00:00Z',
        due_at: '2026-11-06T10:00:00Z', // past due relative to now
        returned_at: null,
        status: 'ACTIVE',
        borrow_photo_path: 'loans/borrow-1.jpg',
        return_photo_path: null,
        student: { id: 'std-1', name: 'Keegan Mahasiswa', nim: '4223121001' },
        projector: { id: 'prj-1', code: 'PROJ-01', name: 'Epson EB-X400 #1', status: 'BORROWED' },
        class: { id: 'cls-1', study_program: 'Ilmu Komputer', cohort_year: 2024, section: 'A' },
      },
      {
        id: 'loan-2',
        borrowed_at: '2026-11-06T09:00:00Z',
        due_at: '2026-11-07T10:00:00Z', // future due
        returned_at: null,
        status: 'ACTIVE',
        borrow_photo_path: 'loans/borrow-2.jpg',
        return_photo_path: null,
        student: { id: 'std-2', name: 'Budi Santoso', nim: '4223121002' },
        projector: { id: 'prj-2', code: 'PROJ-02', name: 'Epson EB-X400 #2', status: 'BORROWED' },
        class: { id: 'cls-2', study_program: 'Sistem Informasi', cohort_year: 2024, section: 'B' },
      },
    ];

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({ data: sampleLoans, error: null, count: 2 }),
        }),
      }),
    });

    const req = new NextRequest('http://localhost/api/admin/loans');
    const res = await getLoans(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.summary).toEqual({
      total_projectors: 10,
      available_count: 6,
      borrowed_count: 3,
      overdue_count: 1,
      maintenance_count: 1,
    });
    expect(data.loans).toHaveLength(2);
    // Loan-1 is overdue because due_at is in past
    expect(data.loans[0].is_overdue).toBe(true);
    // Loan-2 is not overdue
    expect(data.loans[1].is_overdue).toBe(false);
  });

  it('filters loans by search query q', async () => {
    // Mock the 5 count queries
    for (let i = 0; i < 5; i++) {
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          neq: vi.fn().mockResolvedValue({ count: 5 }),
          eq: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ count: 0 }),
            count: 0,
          }),
        }),
      });
    }

    const sampleLoans = [
      {
        id: 'loan-1',
        due_at: '2026-11-07T10:00:00Z',
        status: 'ACTIVE',
        student: { id: 'std-1', name: 'Keegan Mahasiswa', nim: '4223121001' },
        projector: { id: 'prj-1', code: 'PROJ-01', name: 'Epson EB-X400' },
      },
      {
        id: 'loan-2',
        due_at: '2026-11-07T10:00:00Z',
        status: 'ACTIVE',
        student: { id: 'std-2', name: 'Siti Rahma', nim: '4223121005' },
        projector: { id: 'prj-2', code: 'PROJ-02', name: 'BenQ MX550' },
      },
    ];

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({ data: sampleLoans, error: null, count: 2 }),
        }),
      }),
    });

    const req = new NextRequest('http://localhost/api/admin/loans?q=Keegan');
    const res = await getLoans(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.loans).toHaveLength(1);
    expect(data.loans[0].student.name).toBe('Keegan Mahasiswa');
  });
});

