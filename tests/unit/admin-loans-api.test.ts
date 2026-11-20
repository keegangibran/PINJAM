import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getLoans } from '@/app/api/admin/loans/route';
import { sanitizeSearchTerm } from '@/lib/sanitizer';
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

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Search Sanitizer (sanitizeSearchTerm)', () => {
    it('returns empty string for null, undefined, empty, or whitespace-only', () => {
      expect(sanitizeSearchTerm(null)).toBe('');
      expect(sanitizeSearchTerm(undefined)).toBe('');
      expect(sanitizeSearchTerm('')).toBe('');
      expect(sanitizeSearchTerm('   ')).toBe('');
    });

    it('strips PostgREST special syntax characters that break logic trees', () => {
      // Strips , ( ) " ' \ : ; { } [ ]
      const raw = 'Keegan, Gibran (TI) "test":; {val}[x]\\end';
      const clean = sanitizeSearchTerm(raw);
      expect(clean).toBe('Keegan Gibran TI test val x end');
      expect(clean).not.toMatch(/[,()"'\\:;{}[\]]/);
    });

    it('strips SQL wildcards % and _', () => {
      const raw = '%Keegan_Test%_';
      const clean = sanitizeSearchTerm(raw);
      expect(clean).toBe('KeeganTest');
      expect(clean).not.toContain('%');
      expect(clean).not.toContain('_');
    });

    it('collapses multiple whitespace characters and trims', () => {
      const raw = '   Halo    Dunia   Santoso  ';
      expect(sanitizeSearchTerm(raw)).toBe('Halo Dunia Santoso');
    });

    it('truncates inputs longer than 100 characters', () => {
      const longInput = 'a'.repeat(150);
      const clean = sanitizeSearchTerm(longInput);
      expect(clean.length).toBe(100);
      expect(clean).toBe('a'.repeat(100));
    });

    it('preserves valid alphanumeric search terms and hyphens', () => {
      expect(sanitizeSearchTerm('TEST-PROJ-001')).toBe('TEST-PROJ-001');
      expect(sanitizeSearchTerm('Epson EB-X400')).toBe('Epson EB-X400');
      expect(sanitizeSearchTerm('4223121001')).toBe('4223121001');
    });
  });

  describe('Authorization and Guards', () => {
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
  });

  describe('Server-Side Filtering, Pagination, and Two-Stage ID Resolution', () => {
    /**
     * Helper to set up mock for Supabase admin client based on table name
     */
    function setupSupabaseMocks(options: {
      summaryCounts?: {
        total?: number;
        available?: number;
        borrowed?: number;
        overdue?: number;
        maintenance?: number;
      };
      studentsResult?: { id: string }[];
      projectorsResult?: { id: string }[];
      loansResult?: any[];
      loansCount?: number;
      loansError?: any;
      captureLoansQuery?: (chain: any) => void;
      captureStudentsQuery?: (chain: any) => void;
      captureProjectorsQuery?: (chain: any) => void;
    }) {
      const summary = {
        total: options.summaryCounts?.total ?? 10,
        available: options.summaryCounts?.available ?? 6,
        borrowed: options.summaryCounts?.borrowed ?? 3,
        overdue: options.summaryCounts?.overdue ?? 1,
        maintenance: options.summaryCounts?.maintenance ?? 1,
      };

      const capturedLoans: Record<string, any[]> = {
        gte: [],
        lte: [],
        eq: [],
        lt: [],
        or: [],
        order: [],
        range: [],
      };

      const capturedStudents: Record<string, any[]> = {
        or: [],
        limit: [],
      };

      const capturedProjectors: Record<string, any[]> = {
        or: [],
        limit: [],
      };

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'students') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn((cond: string) => {
                capturedStudents.or.push(cond);
                return {
                  limit: vi.fn((lim: number) => {
                    capturedStudents.limit.push(lim);
                    return Promise.resolve({ data: options.studentsResult ?? [], error: null });
                  }),
                };
              }),
            }),
          };
        }

        if (table === 'projectors') {
          return {
            select: vi.fn((cols: string, opts?: any) => {
              // Check if this is the Two-Stage search query or a summary count query
              if (!opts || !opts.head) {
                return {
                  or: vi.fn((cond: string) => {
                    capturedProjectors.or.push(cond);
                    return {
                      limit: vi.fn((lim: number) => {
                        capturedProjectors.limit.push(lim);
                        return Promise.resolve({ data: options.projectorsResult ?? [], error: null });
                      }),
                    };
                  }),
                };
              }

              // Summary count query
              return {
                neq: vi.fn().mockResolvedValue({ count: summary.total }),
                eq: vi.fn((field: string, val: string) => {
                  if (val === 'AVAILABLE') return Promise.resolve({ count: summary.available });
                  if (val === 'BORROWED') return Promise.resolve({ count: summary.borrowed });
                  if (val === 'MAINTENANCE') return Promise.resolve({ count: summary.maintenance });
                  return Promise.resolve({ count: 0 });
                }),
              };
            }),
          };
        }

        if (table === 'loans') {
          return {
            select: vi.fn((cols: string, opts?: any) => {
              // Overdue summary count query
              if (opts?.head) {
                return {
                  eq: vi.fn().mockReturnValue({
                    lt: vi.fn().mockResolvedValue({ count: summary.overdue }),
                  }),
                };
              }

              // Main loans ledger query chain
              const chain: any = {};
              chain.gte = vi.fn((field: string, val: string) => {
                capturedLoans.gte.push([field, val]);
                return chain;
              });
              chain.lte = vi.fn((field: string, val: string) => {
                capturedLoans.lte.push([field, val]);
                return chain;
              });
              chain.eq = vi.fn((field: string, val: string) => {
                capturedLoans.eq.push([field, val]);
                return chain;
              });
              chain.lt = vi.fn((field: string, val: string) => {
                capturedLoans.lt.push([field, val]);
                return chain;
              });
              chain.or = vi.fn((cond: string) => {
                capturedLoans.or.push(cond);
                return chain;
              });
              chain.order = vi.fn((col: string, orderOpts: any) => {
                capturedLoans.order.push([col, orderOpts]);
                return chain;
              });
              chain.range = vi.fn((start: number, end: number) => {
                capturedLoans.range.push([start, end]);
                return Promise.resolve({
                  data: options.loansResult ?? [],
                  error: options.loansError ?? null,
                  count: options.loansCount ?? (options.loansResult?.length ?? 0),
                });
              });

              if (options.captureLoansQuery) {
                options.captureLoansQuery(capturedLoans);
              }
              return chain;
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      });

      if (options.captureStudentsQuery) {
        options.captureStudentsQuery(capturedStudents);
      }
      if (options.captureProjectorsQuery) {
        options.captureProjectorsQuery(capturedProjectors);
      }

      return { capturedLoans, capturedStudents, capturedProjectors };
    }

    it('computes real-time summary counts and handles default empty query', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));

      const sampleLoans = [
        {
          id: 'loan-1',
          borrowed_at: '2026-11-06T08:00:00Z',
          due_at: '2026-11-06T10:00:00Z',
          returned_at: null,
          status: 'ACTIVE',
          student: { id: 'std-1', name: 'Keegan Mahasiswa', nim: '4223121001' },
          projector: { id: 'prj-1', code: 'PROJ-01', name: 'Epson EB-X400 #1' },
          class: { id: 'cls-1', study_program: 'Ilmu Komputer', cohort_year: 2024, section: 'A' },
        },
      ];

      const { capturedLoans } = setupSupabaseMocks({
        summaryCounts: { total: 10, available: 6, borrowed: 3, overdue: 1, maintenance: 1 },
        loansResult: sampleLoans,
        loansCount: 1,
      });

      const req = new NextRequest('http://localhost/api/admin/loans');
      const res = await getLoans(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
      expect(data.success).toBe(true);
      expect(data.summary).toEqual({
        total_projectors: 10,
        available_count: 6,
        borrowed_count: 3,
        overdue_count: 1,
        maintenance_count: 1,
      });
      expect(data.total_count).toBe(1);
      expect(data.loans).toHaveLength(1);
      expect(data.loans[0].is_overdue).toBe(true);
      // Empty query should not apply .or() to loans
      expect(capturedLoans.or).toHaveLength(0);
      // Default pagination range: offset 0, limit 50 (0 to 49)
      expect(capturedLoans.range).toEqual([[0, 49]]);
      expect(capturedLoans.order).toEqual([['borrowed_at', { ascending: false }]]);
    });

    it('handles search when both students and projectors match', async () => {
      const { capturedLoans, capturedStudents, capturedProjectors } = setupSupabaseMocks({
        studentsResult: [{ id: 'std-10' }],
        projectorsResult: [{ id: 'prj-20' }, { id: 'prj-21' }],
        loansResult: [
          {
            id: 'loan-10',
            due_at: '2026-11-06T10:00:00Z',
            status: 'COMPLETED',
            student: { id: 'std-10', name: 'Keegan', nim: '4223121001' },
            projector: { id: 'prj-20', code: 'PROJ-20', name: 'Epson' },
          },
        ],
        loansCount: 1,
      });

      const req = new NextRequest('http://localhost/api/admin/loans?q=Keegan');
      const res = await getLoans(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(capturedStudents.or[0]).toBe('name.ilike.%Keegan%,nim.ilike.%Keegan%');
      expect(capturedProjectors.or[0]).toBe('code.ilike.%Keegan%,name.ilike.%Keegan%');

      // Check loans .or() condition
      expect(capturedLoans.or[0]).toBe('student_id.in.(std-10),projector_id.in.(prj-20,prj-21),returned_by_name.ilike.%Keegan%');
      expect(data.total_count).toBe(1);
      expect(data.loans[0].id).toBe('loan-10');
    });

    it('handles search when only students match (projectorIds is empty)', async () => {
      const { capturedLoans } = setupSupabaseMocks({
        studentsResult: [{ id: 'std-1' }],
        projectorsResult: [],
        loansResult: [{ id: 'loan-1', due_at: '2026-11-06T10:00:00Z', status: 'ACTIVE' }],
        loansCount: 1,
      });

      const req = new NextRequest('http://localhost/api/admin/loans?q=Budi');
      const res = await getLoans(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      // Projector ID is excluded from .or()
      expect(capturedLoans.or[0]).toBe('student_id.in.(std-1),returned_by_name.ilike.%Budi%');
      expect(data.total_count).toBe(1);
    });

    it('handles search when only projectors match (studentIds is empty)', async () => {
      const { capturedLoans } = setupSupabaseMocks({
        studentsResult: [],
        projectorsResult: [{ id: 'prj-003' }],
        loansResult: [{ id: 'loan-3', due_at: '2026-11-06T10:00:00Z', status: 'COMPLETED' }],
        loansCount: 1,
      });

      const req = new NextRequest('http://localhost/api/admin/loans?q=TEST-PROJ-003');
      const res = await getLoans(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      // Student ID is excluded from .or()
      expect(capturedLoans.or[0]).toBe('projector_id.in.(prj-003),returned_by_name.ilike.%TEST-PROJ-003%');
      expect(data.total_count).toBe(1);
    });

    it('handles search when neither students nor projectors match (search only by returned_by_name)', async () => {
      const { capturedLoans } = setupSupabaseMocks({
        studentsResult: [],
        projectorsResult: [],
        loansResult: [
          {
            id: 'loan-rep-1',
            due_at: '2026-11-06T10:00:00Z',
            status: 'COMPLETED',
            returned_by_name: 'Ahmad Perwakilan',
          },
        ],
        loansCount: 1,
      });

      const req = new NextRequest('http://localhost/api/admin/loans?q=Ahmad');
      const res = await getLoans(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      // Only returned_by_name condition in .or()
      expect(capturedLoans.or[0]).toBe('returned_by_name.ilike.%Ahmad%');
      expect(data.total_count).toBe(1);
      expect(data.loans[0].returned_by_name).toBe('Ahmad Perwakilan');
    });

    it('sanitizes special characters (commas, parentheses, quotes) safely in search query', async () => {
      const { capturedLoans, capturedStudents } = setupSupabaseMocks({
        studentsResult: [{ id: 'std-5' }],
        projectorsResult: [],
        loansResult: [],
        loansCount: 0,
      });

      // User enters commas, parentheses, quotes, percent
      const req = new NextRequest('http://localhost/api/admin/loans?q=Keegan%2C+(Mahasiswa)%22%25');
      const res = await getLoans(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      // Should sanitize to "Keegan Mahasiswa" without commas or parens
      expect(capturedStudents.or[0]).toBe('name.ilike.%Keegan Mahasiswa%,nim.ilike.%Keegan Mahasiswa%');
      expect(capturedLoans.or[0]).toBe('student_id.in.(std-5),returned_by_name.ilike.%Keegan Mahasiswa%');
    });

    it('combines search term with status filter (COMPLETED) and date filters (from, to)', async () => {
      const { capturedLoans } = setupSupabaseMocks({
        studentsResult: [{ id: 'std-1' }],
        projectorsResult: [],
        loansResult: [],
        loansCount: 0,
      });

      const req = new NextRequest(
        'http://localhost/api/admin/loans?q=Keegan&status=COMPLETED&from=2026-11-01&to=2026-11-15'
      );
      const res = await getLoans(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      // Verify date gte/lte
      expect(capturedLoans.gte).toEqual([['borrowed_at', new Date('2026-11-01').toISOString()]]);
      expect(capturedLoans.lte).toEqual([['borrowed_at', new Date('2026-11-15T23:59:59.999Z').toISOString()]]);
      // Verify status eq
      expect(capturedLoans.eq).toEqual([['status', 'COMPLETED']]);
      // Verify or condition
      expect(capturedLoans.or[0]).toBe('student_id.in.(std-1),returned_by_name.ilike.%Keegan%');
    });

    it('handles OVERDUE status filter correctly with due_at < now', async () => {
      const { capturedLoans } = setupSupabaseMocks({
        loansResult: [],
        loansCount: 0,
      });

      const req = new NextRequest('http://localhost/api/admin/loans?status=OVERDUE');
      const res = await getLoans(req);

      expect(res.status).toBe(200);
      expect(capturedLoans.eq).toEqual([['status', 'ACTIVE']]);
      expect(capturedLoans.lt).toHaveLength(1);
      expect(capturedLoans.lt[0][0]).toBe('due_at');
    });

    it('applies server-side pagination with custom limit and offset before fetching', async () => {
      const { capturedLoans } = setupSupabaseMocks({
        loansResult: Array(10).fill({ id: 'loan-x', status: 'COMPLETED' }),
        loansCount: 42,
      });

      const req = new NextRequest('http://localhost/api/admin/loans?limit=10&offset=20');
      const res = await getLoans(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      // Offset 20, limit 10 -> range(20, 29)
      expect(capturedLoans.range).toEqual([[20, 29]]);
      expect(data.total_count).toBe(42);
      expect(data.loans).toHaveLength(10);
    });

    it('clamps limit between 1 and 200, and offset >= 0', async () => {
      const { capturedLoans } = setupSupabaseMocks({
        loansResult: [],
        loansCount: 0,
      });

      // Request with excessive limit and negative offset
      const req = new NextRequest('http://localhost/api/admin/loans?limit=999&offset=-5');
      const res = await getLoans(req);

      expect(res.status).toBe(200);
      // Offset clamped to 0, limit clamped to 200 -> range(0, 199)
      expect(capturedLoans.range).toEqual([[0, 199]]);
    });

    it('returns 500 error when database query fails', async () => {
      setupSupabaseMocks({
        loansError: { message: 'Database query timeout' },
      });

      const req = new NextRequest('http://localhost/api/admin/loans');
      const res = await getLoans(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error.code).toBe('FETCH_LOANS_FAILED');
      expect(data.error.message).toBe('Database query timeout');
    });
  });
});
