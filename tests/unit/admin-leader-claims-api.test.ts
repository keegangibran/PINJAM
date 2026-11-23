import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getLeaderClaims } from '@/app/api/admin/leader-claims/route';
import * as guards from '@/lib/auth/guards';

const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

describe('Admin Leader Claims API Unit Tests (GET /api/admin/leader-claims)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthorized access if requireStaff fails', async () => {
    vi.spyOn(guards, 'requireStaff').mockRejectedValueOnce({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Autentikasi diperlukan',
    });

    const req = new Request('http://localhost/api/admin/leader-claims');
    const res = await getLeaderClaims(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('successfully returns leader claims queue with summary counts', async () => {
    vi.spyOn(guards, 'requireStaff').mockResolvedValueOnce({
      userId: 'staff-usr-1',
      email: 'staff@pinjam.test',
      role: 'STAFF',
      staffProfile: { id: 'staff-p-1', name: 'Petugas TU', role: 'STAFF', isActive: true },
    });

    const mockClaims = [
      {
        id: 'claim-1',
        class_id: 'cls-1',
        student_id: 'stu-1',
        claim_type: 'INITIAL',
        status: 'PENDING',
        decided_by: null,
        decided_at: null,
        notes: 'Calon ketua kelas baru',
        created_at: '2026-11-23T08:00:00Z',
        student: { id: 'stu-1', name: 'Keegan Gibran', nim: '4253250029', email: 'keegan@mhs.unimed.ac.id', registration_status: 'ACTIVE' },
        class: { id: 'cls-1', study_program: 'Ilmu Komputer', cohort_year: 2025, section: 'B', academic_term: '2026/2027-GENAP', is_active: true },
        decided_by_staff: null,
      },
      {
        id: 'claim-2',
        class_id: 'cls-2',
        student_id: 'stu-2',
        claim_type: 'REPLACEMENT',
        status: 'APPROVED',
        decided_by: 'staff-p-1',
        decided_at: '2026-11-22T10:00:00Z',
        notes: 'Disetujui',
        created_at: '2026-11-22T09:00:00Z',
        student: { id: 'stu-2', name: 'Mahasiswa Rekan', nim: '4253250030', email: 'rekan@pinjam.test', registration_status: 'ACTIVE' },
        class: { id: 'cls-2', study_program: 'Pendidikan Matematika', cohort_year: 2024, section: 'A', academic_term: '2026/2027-GANJIL', is_active: true },
        decided_by_staff: { id: 'staff-p-1', name: 'Petugas TU', role: 'STAFF' },
      },
    ];

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'class_leader_claims') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'status') {
              return Promise.resolve({
                data: [{ status: 'PENDING' }, { status: 'APPROVED' }, { status: 'REJECTED' }],
                error: null,
              });
            }
            return {
              order: vi.fn().mockReturnValue(Promise.resolve({ data: mockClaims, error: null })),
            };
          }),
        };
      }
      return {};
    });

    const req = new Request('http://localhost/api/admin/leader-claims?status=ALL');
    const res = await getLeaderClaims(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(2);
    expect(json.summary.pending_count).toBe(1);
    expect(json.summary.approved_count).toBe(1);
    expect(json.summary.rejected_count).toBe(1);
    expect(json.summary.total_count).toBe(3);
  });

  it('filters claims by search query on student name or NIM', async () => {
    vi.spyOn(guards, 'requireStaff').mockResolvedValueOnce({
      userId: 'staff-usr-1',
      email: 'staff@pinjam.test',
      role: 'STAFF',
      staffProfile: { id: 'staff-p-1', name: 'Petugas TU', role: 'STAFF', isActive: true },
    });

    const mockClaims = [
      {
        id: 'claim-1',
        claim_type: 'INITIAL',
        status: 'PENDING',
        student: { id: 'stu-1', name: 'Keegan Gibran', nim: '4253250029' },
        class: { study_program: 'Ilmu Komputer' },
      },
      {
        id: 'claim-2',
        claim_type: 'REPLACEMENT',
        status: 'PENDING',
        student: { id: 'stu-2', name: 'Farel Luther', nim: '4253250088' },
        class: { study_program: 'Ilmu Komputer' },
      },
    ];

    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockImplementation((fields: string) => {
        if (fields === 'status') {
          return Promise.resolve({ data: [{ status: 'PENDING' }, { status: 'PENDING' }], error: null });
        }
        return {
          order: vi.fn().mockReturnValue(Promise.resolve({ data: mockClaims, error: null })),
        };
      }),
    });

    const req = new Request('http://localhost/api/admin/leader-claims?search=keegan');
    const res = await getLeaderClaims(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.length).toBe(1);
    expect(json.data[0].student.name).toBe('Keegan Gibran');
  });
});
