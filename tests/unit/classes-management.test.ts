import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as createClass, PATCH as updateClass } from '@/app/api/admin/classes/route';
import { POST as copyTerm } from '@/app/api/admin/classes/copy-term/route';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

// Mocks
const mockAdminFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));

describe('Classes Management API Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guards, 'requireAdmin').mockResolvedValue({
      userId: 'usr-admin',
      email: 'admin@kampus.ac.id',
      role: 'ADMIN',
      staffProfile: { id: 'stf-admin', name: 'Admin Pusat', role: 'ADMIN', isActive: true },
    });
  });

  describe('POST /api/admin/classes (Create Class)', () => {
    it('validates schema and rejects invalid cohort year', async () => {
      const req = new Request('http://localhost/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_program: 'Informatika',
          cohort_year: 1999, // < 2000
          section: 'A',
          academic_term: '2026/2027-GANJIL',
        }),
      });

      const res = await createClass(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate class combination with 409', async () => {
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: 'cls-existing' },
        }),
      }));

      const req = new Request('http://localhost/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GANJIL',
        }),
      });

      const res = await createClass(req);
      const data = await res.json();
      expect(res.status).toBe(409);
      expect(data.error.code).toBe('DUPLICATE_CLASS');
    });

    it('creates class and logs audit trail', async () => {
      // 1. Check existing returns null
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null }),
      }));

      // 2. Insert new class
      mockAdminFrom.mockImplementationOnce(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            id: 'cls-new',
            study_program: 'Informatika',
            cohort_year: 2024,
            section: 'A',
            academic_term: '2026/2027-GANJIL',
            is_active: true,
          },
          error: null,
        }),
      }));

      const req = new Request('http://localhost/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GANJIL',
        }),
      });

      const res = await createClass(req);
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('cls-new');

      expect(audit.recordAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'SETTINGS_UPDATED',
          entityType: 'classes',
          entityId: 'cls-new',
          metadata: expect.objectContaining({ action: 'CREATE_CLASS' }),
        })
      );
    });
  });

  describe('PATCH /api/admin/classes (Release Class Leader FR-18)', () => {
    it('releases class leader, invalidates qr_token_version, and logs LEADER_REVOKED', async () => {
      // 1. Fetch current class
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: 'cls-1', leader_student_id: 'stu-leader-1', is_active: true },
          error: null,
        }),
      }));

      // 2. Fetch student qr_token_version
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { qr_token_version: 1 },
        }),
      }));

      // 3. Update student qr_token_version to 2
      const updateStudentMock = vi.fn().mockReturnThis();
      mockAdminFrom.mockImplementationOnce(() => ({
        update: updateStudentMock,
        eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      }));

      // 4. Update class (leader_student_id = null)
      mockAdminFrom.mockImplementationOnce(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: 'cls-1', leader_student_id: null, is_active: true },
          error: null,
        }),
      }));

      const req = new Request('http://localhost/api/admin/classes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: '11111111-1111-4111-a111-111111111111',
          release_leader: true,
          release_reason: 'Mundur dari jabatan ketua kelas',
        }),
      });

      const res = await updateClass(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify qr_token_version incremented
      expect(updateStudentMock).toHaveBeenCalledWith(
        expect.objectContaining({ qr_token_version: 2 })
      );

      // Verify LEADER_REVOKED audit log
      expect(audit.recordAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'LEADER_REVOKED',
          entityType: 'classes',
          metadata: expect.objectContaining({
            previous_leader_student_id: 'stu-leader-1',
            reason: 'Mundur dari jabatan ketua kelas',
          }),
        })
      );
    });
  });

  describe('POST /api/admin/classes/copy-term (FR-01F, FT-04)', () => {
    it('copies active classes without leaders to new term', async () => {
      // 1. Fetch active source classes
      mockAdminFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function (this: any, col: string) {
          if (col === 'is_active') {
            return Promise.resolve({
              data: [
                { study_program: 'Informatika', cohort_year: 2024, section: 'A' },
                { study_program: 'Informatika', cohort_year: 2024, section: 'B' },
              ],
              error: null,
            });
          }
          return this;
        }),
      }));

      // 2. Upsert target classes with leader_student_id: null
      const upsertMock = vi.fn().mockReturnThis();
      mockAdminFrom.mockImplementationOnce(() => ({
        upsert: upsertMock,
        select: vi.fn().mockResolvedValueOnce({
          data: [
            { id: 'cls-new-1', study_program: 'Informatika', cohort_year: 2024, section: 'A' },
            { id: 'cls-new-2', study_program: 'Informatika', cohort_year: 2024, section: 'B' },
          ],
          error: null,
        }),
      }));

      const req = new Request('http://localhost/api/admin/classes/copy-term', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_term: '2026/2027-GANJIL',
          target_term: '2026/2027-GENAP',
        }),
      });

      const res = await copyTerm(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify payload passed to upsert stripped leaders
      expect(upsertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            study_program: 'Informatika',
            section: 'A',
            academic_term: '2026/2027-GENAP',
            leader_student_id: null,
            leader_since: null,
            is_active: true,
          }),
        ]),
        expect.anything()
      );
    });
  });
});
