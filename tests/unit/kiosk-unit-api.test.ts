import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as getKioskUnit } from '@/app/api/kiosk/unit/route';
import * as guards from '@/lib/auth/guards';

const mockAdminFrom = vi.fn();
const mockCreateSignedUrl = vi.fn().mockResolvedValue({
  data: { signedUrl: 'https://mock.supabase.co/storage/v1/object/sign/faces/borrower.jpg' },
  error: null,
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  })),
}));

describe('Kiosk Unit API Unit Tests (FR-05, FT-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

    vi.spyOn(guards, 'requireStaff').mockResolvedValue({
      userId: 'usr-staff-1',
      email: 'petugas@unimed.ac.id',
      role: 'STAFF',
      staffProfile: { id: 'stf-1', name: 'Petugas Loket', role: 'STAFF', isActive: true },
    });
  });

  it('rejects unknown projector code with 404 PROJECTOR_NOT_FOUND', async () => {
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({ data: null, error: new Error('Not found') }),
    }));

    const req = new Request('http://localhost/api/kiosk/unit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projector_code: 'UNKNOWN-999' }),
    });

    const res = await getKioskUnit(req);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error.code).toBe('PROJECTOR_NOT_FOUND');
  });

  it('returns AVAILABLE projector with active_loan = null', async () => {
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'proj-1',
          code: 'PROJ-001',
          name: 'Epson EB-X400',
          status: 'AVAILABLE',
          notes: null,
        },
        error: null,
      }),
    }));

    const req = new Request('http://localhost/api/kiosk/unit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projector_code: 'PROJ-001' }),
    });

    const res = await getKioskUnit(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('AVAILABLE');
    expect(json.data.active_loan).toBeNull();
  });

  it('returns BORROWED projector with active loan, overdue calculation, and borrower photo signed URL (FR-05)', async () => {
    // 1. Mock query projectors
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'proj-2',
          code: 'PROJ-002',
          name: 'BenQ MX535',
          status: 'BORROWED',
          notes: null,
        },
        error: null,
      }),
    }));

    // Past due time (overdue!)
    const overdueTime = new Date(Date.now() - 3600000).toISOString();

    // 2. Mock query active loan
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'loan-active-1',
          student_id: 'stu-borrower-1',
          borrowed_at: new Date(Date.now() - 7200000).toISOString(),
          due_at: overdueTime,
          students: {
            id: 'stu-borrower-1',
            name: 'Peminjam Aktif',
            nim: '220101088',
            profile_photo_path: 'faces/stu-borrower.jpg',
          },
          classes: {
            study_program: 'Informatika',
            cohort_year: 2024,
            section: 'A',
            academic_term: '2026/2027-GANJIL',
          },
        },
        error: null,
      }),
    }));

    const req = new Request('http://localhost/api/kiosk/unit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projector_code: 'PROJ-002' }),
    });

    const res = await getKioskUnit(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('BORROWED');
    expect(json.data.active_loan).toBeDefined();
    expect(json.data.active_loan.student_name).toBe('Peminjam Aktif');
    expect(json.data.active_loan.is_overdue).toBe(true);
    expect(json.data.active_loan.profile_photo_signed_url).toContain('faces/borrower.jpg');
  });
});
