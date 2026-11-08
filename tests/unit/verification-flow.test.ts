import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH as handleVerification } from '@/app/api/admin/verifications/[studentId]/route';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

// Mocks
const mockAdminFrom = vi.fn();
const mockStorageRemove = vi.fn().mockResolvedValue({ data: [], error: null });

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    storage: {
      from: vi.fn(() => ({
        remove: mockStorageRemove,
      })),
    },
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));

describe('Verification Decision API Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guards, 'requireStaff').mockResolvedValue({
      userId: 'usr-staff',
      email: 'petugas@kampus.ac.id',
      role: 'STAFF',
      staffProfile: { id: 'stf-1', name: 'Petugas Budi', role: 'STAFF', isActive: true },
    });
  });

  it('rejects APPROVE if any of 3 checklist items is false (FR-01B, FR-01C)', async () => {
    const req = new Request('http://localhost/api/admin/verifications/stu-123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVE',
        checks: {
          face_match: true,
          name_match: true,
          status_confirmed: false, // Incomplete!
        },
      }),
    });

    const res = await handleVerification(req, {
      params: Promise.resolve({ studentId: 'stu-123' }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('CHECKS_INCOMPLETE');
  });

  it('rejects REJECT without notes (FR-01C)', async () => {
    const req = new Request('http://localhost/api/admin/verifications/stu-123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'REJECT',
        checks: {
          face_match: false,
          name_match: true,
          status_confirmed: false,
        },
        notes: '', // Empty notes!
      }),
    });

    const res = await handleVerification(req, {
      params: Promise.resolve({ studentId: 'stu-123' }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('NOTES_REQUIRED');
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it('rejects REQUEST_RESUBMISSION without notes (FR-01C)', async () => {
    const req = new Request('http://localhost/api/admin/verifications/stu-123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'REQUEST_RESUBMISSION',
        checks: {
          face_match: false,
          name_match: true,
          status_confirmed: false,
        },
        notes: '   ', // whitespace only!
      }),
    });

    const res = await handleVerification(req, {
      params: Promise.resolve({ studentId: 'stu-123' }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('NOTES_REQUIRED');
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it('rejects APPROVE if another ACTIVE account with the same NIM exists (Partial Unique Index)', async () => {
    // 1. Fetch current student
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'stu-duplicate',
          nim: '220101001',
          name: 'Mahasiswa Kedua',
          current_class_id: 'cls-1',
          verification_document_path: 'documents/ktm.jpg',
          registration_status: 'PENDING_VERIFICATION',
        },
        error: null,
      }),
    }));

    // 2. Query existing active student with same NIM returns a record
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: { id: 'stu-first', name: 'Mahasiswa Pertama' },
      }),
    }));

    const req = new Request('http://localhost/api/admin/verifications/stu-duplicate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVE',
        checks: {
          face_match: true,
          name_match: true,
          status_confirmed: true,
        },
      }),
    });

    const res = await handleVerification(req, {
      params: Promise.resolve({ studentId: 'stu-duplicate' }),
    });

    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error.code).toBe('ACTIVE_NIM_EXISTS');
  });

  it('approves student, deletes document photo immediately (NFR-08), sets class leader, and audits', async () => {
    // 1. Fetch current student
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'stu-valid',
          nim: '220101002',
          name: 'Mahasiswa Sah',
          current_class_id: 'cls-1',
          verification_document_path: 'documents/stu-valid_ktm.jpg',
          registration_status: 'PENDING_VERIFICATION',
        },
        error: null,
      }),
    }));

    // 2. Check duplicate active NIM returns null
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({ data: null }),
    }));

    // 3. Update student table (status -> ACTIVE, verification_document_path -> null)
    const updateStudentMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      update: updateStudentMock,
      eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    }));

    // 4. Fetch initial pending claim
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: { id: 'clm-initial-1', status: 'PENDING' },
      }),
    }));

    // 5. Update classes table (set leader_student_id)
    const updateClassMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      update: updateClassMock,
      eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    }));

    // 6. Update class_leader_claims (set status -> APPROVED)
    const updateClaimMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      update: updateClaimMock,
      eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    }));

    const req = new Request('http://localhost/api/admin/verifications/stu-valid', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVE',
        checks: {
          face_match: true,
          name_match: true,
          status_confirmed: true,
        },
      }),
    });

    const res = await handleVerification(req, {
      params: Promise.resolve({ studentId: 'stu-valid' }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.new_status).toBe('ACTIVE');

    // Verify document photo deleted immediately from storage (NFR-08)
    expect(mockStorageRemove).toHaveBeenCalledWith(['documents/stu-valid_ktm.jpg']);

    // Verify verification_document_path cleared in database
    expect(updateStudentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        registration_status: 'ACTIVE',
        verification_document_path: null,
      })
    );

    // Verify class leader updated
    expect(updateClassMock).toHaveBeenCalledWith(
      expect.objectContaining({
        leader_student_id: 'stu-valid',
      })
    );

    // Verify audit logs recorded
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'VERIFICATION_DECIDED',
        entityType: 'students',
        entityId: 'stu-valid',
        metadata: expect.objectContaining({
          decision: 'APPROVE',
          document_photo_deleted: true,
        }),
      })
    );
  });

  it('requests resubmission with valid notes, updates status to RESUBMISSION_REQUIRED, deletes document photo (NFR-08), and audits', async () => {
    // 1. Fetch current student
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'stu-resubmit',
          nim: '220101003',
          name: 'Mahasiswa Foto Buram',
          current_class_id: 'cls-1',
          verification_document_path: 'documents/stu-resubmit_ktm.jpg',
          registration_status: 'PENDING_DOCUMENT',
        },
        error: null,
      }),
    }));

    // 2. Update student table (status -> RESUBMISSION_REQUIRED, verification_notes, verification_document_path -> null)
    const updateStudentMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      update: updateStudentMock,
      eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    }));

    const validNotes = 'Foto KTM buram dan tidak terbaca, silakan ambil ulang foto fisik KTM di meja TU.';
    const req = new Request('http://localhost/api/admin/verifications/stu-resubmit', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'REQUEST_RESUBMISSION',
        checks: {
          face_match: false,
          name_match: true,
          status_confirmed: false,
        },
        notes: validNotes,
      }),
    });

    const res = await handleVerification(req, {
      params: Promise.resolve({ studentId: 'stu-resubmit' }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.new_status).toBe('RESUBMISSION_REQUIRED');

    // 3. Verify mock database students receives update with status and notes
    expect(updateStudentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        registration_status: 'RESUBMISSION_REQUIRED',
        verification_notes: validNotes,
        verification_document_path: null,
      })
    );

    // 4. Verify document photo deleted immediately from storage (NFR-08 & FR-01C)
    expect(mockStorageRemove).toHaveBeenCalledWith(['documents/stu-resubmit_ktm.jpg']);

    // 5. Verify audit log records REQUEST_RESUBMISSION decision
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'VERIFICATION_DECIDED',
        entityType: 'students',
        entityId: 'stu-resubmit',
        metadata: expect.objectContaining({
          decision: 'REQUEST_RESUBMISSION',
          notes: validNotes,
          document_photo_deleted: true,
        }),
      })
    );
  });
});

