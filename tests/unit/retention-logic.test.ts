import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeRetentionAndMaintenance } from '@/lib/retention';
import * as audit from '@/lib/audit';

const mockAdminFrom = vi.fn();
const mockStorageFrom = vi.fn();
const mockStorageRemove = vi.fn();
const mockStorageList = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    storage: {
      from: mockStorageFrom,
    },
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ success: true, id: 'audit-log-1' }),
}));

describe('Retention and Scheduled Maintenance Logic (src/lib/retention.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageFrom.mockReturnValue({
      remove: mockStorageRemove,
      list: mockStorageList,
    });
    mockStorageRemove.mockResolvedValue({ data: null, error: null });
    mockStorageList.mockResolvedValue({ data: [], error: null });
  });

  it('R-01: Blocks concurrent execution if job is already RUNNING less than 5 minutes ago', async () => {
    const recentStartTime = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 mins ago
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              value: {
                status: 'RUNNING',
                last_run_at: recentStartTime,
              },
            },
          }),
        }),
      }),
    });

    const result = await executeRetentionAndMaintenance();

    expect(result.success).toBe(false);
    expect(result.code).toBe('CRON_ALREADY_RUNNING');
    expect(result.failures).toContain('Tugas pembersihan retensi sedang berjalan di proses lain.');
  });

  it('R-02: Deletes eligible verification document photos (>24h or decided) and nullifies path', async () => {
    // 0. Concurrency check (idle)
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { value: { status: 'COMPLETED' } } }),
        }),
      }),
    });
    // Set RUNNING
    mockAdminFrom.mockReturnValueOnce({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });

    // 1. Document photos query
    const oldDate = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30h ago
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'std-decided',
              verification_document_path: 'documents/doc_decided.jpg',
              registration_status: 'ACTIVE',
              created_at: new Date().toISOString(),
            },
            {
              id: 'std-old-undecided',
              verification_document_path: 'documents/doc_old.jpg',
              registration_status: 'PENDING_DOCUMENT',
              created_at: oldDate,
            },
            {
              id: 'std-recent-undecided',
              verification_document_path: 'documents/doc_recent.jpg',
              registration_status: 'PENDING_DOCUMENT',
              created_at: new Date().toISOString(), // recent, should NOT be deleted
            },
          ],
        }),
      }),
    });

    // Mock update for the 2 eligible documents
    const mockDocUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockAdminFrom
      .mockReturnValueOnce({ update: mockDocUpdate })
      .mockReturnValueOnce({ update: mockDocUpdate });

    // 2. Inactive face photos query (none)
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }),
    });

    // 3. Completed loans query (none)
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }),
    });

    // 4. Academic term query (not expired)
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { value: { term_ends_at: new Date(Date.now() + 86400000).toISOString() } },
          }),
        }),
      }),
    });

    // 5. Storage monitoring query
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { value: { warning_threshold_pct: 70, max_capacity_bytes: 1073741824 } },
          }),
        }),
      }),
    });
    // Upsert storage monitoring
    mockAdminFrom.mockReturnValueOnce({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });

    // 6. Keep alive query
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [{ key: 'academic_term' }] }),
      }),
    });

    // 7. Upsert retention_last_run
    mockAdminFrom.mockReturnValueOnce({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });

    const result = await executeRetentionAndMaintenance();

    expect(result.success).toBe(true);
    expect(result.retention_results.deleted_document_photos).toBe(2);
    expect(mockStorageRemove).toHaveBeenCalledWith(['documents/doc_decided.jpg']);
    expect(mockStorageRemove).toHaveBeenCalledWith(['documents/doc_old.jpg']);
    // Recent undecided doc was NOT removed
    expect(mockStorageRemove).not.toHaveBeenCalledWith(['documents/doc_recent.jpg']);
  });

  it('R-03: Deletes inactive student face photos deactivated >90 days, preserves active student face photos', async () => {
    // 0. Concurrency check
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { value: { status: 'COMPLETED' } } }),
        }),
      }),
    });
    // Set RUNNING
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });

    // 1. Doc photos (none)
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockResolvedValue({ data: [] }),
      }),
    });

    // 2. Inactive face photos query returns 1 eligible inactive student
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'std-inactive-old',
                  profile_photo_path: 'faces/face_inactive_90d.jpg',
                  deactivated_at: '2026-05-01T00:00:00Z',
                },
              ],
            }),
          }),
        }),
      }),
    });

    // Mock update profile_photo_path to null
    const mockFaceUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockAdminFrom.mockReturnValueOnce({ update: mockFaceUpdate });

    // 3. Loans (none)
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }),
    });

    // 4. Academic term (active)
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { value: {} } }),
        }),
      }),
    });

    // 5. Storage monitoring
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { value: {} } }),
        }),
      }),
    });
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });

    // 6. Keep alive
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [] }) }),
    });

    // 7. Upsert final run
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });

    const result = await executeRetentionAndMaintenance();

    expect(result.success).toBe(true);
    expect(result.retention_results.deleted_face_photos).toBe(1);
    expect(mockStorageRemove).toHaveBeenCalledWith(['faces/face_inactive_90d.jpg']);
    expect(mockFaceUpdate).toHaveBeenCalledWith({ profile_photo_path: null });
  });

  it('R-04: Deletes loan photos >180 days with NORMAL condition, but PRESERVES loans with UNRESOLVED issue', async () => {
    // 0. Concurrency check
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { value: { status: 'COMPLETED' } } }),
        }),
      }),
    });
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });

    // 1. Doc photos (none)
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [] }) }),
    });

    // 2. Inactive face photos (none)
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }),
    });

    // 3. Completed loans query: returns 1 normal loan and 1 unresolved issue loan
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'loan-normal',
                  borrow_photo_path: 'loans/borrow_normal.jpg',
                  return_photo_path: 'loans/return_normal.jpg',
                  return_condition: 'NORMAL',
                  issue_resolved_at: null,
                },
                {
                  id: 'loan-unresolved-issue',
                  borrow_photo_path: 'loans/borrow_issue.jpg',
                  return_photo_path: 'loans/return_issue.jpg',
                  return_condition: 'REPORTED_ISSUE',
                  issue_resolved_at: null, // UNRESOLVED! Must NOT delete!
                },
                {
                  id: 'loan-resolved-issue',
                  borrow_photo_path: 'loans/borrow_resolved.jpg',
                  return_photo_path: null,
                  return_condition: 'REPORTED_ISSUE',
                  issue_resolved_at: '2026-06-01T00:00:00Z', // RESOLVED! Eligible to delete
                },
              ],
            }),
          }),
        }),
      }),
    });

    // Mock update for loan-normal and loan-resolved-issue
    const mockLoanUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockAdminFrom
      .mockReturnValueOnce({ update: mockLoanUpdate })
      .mockReturnValueOnce({ update: mockLoanUpdate });

    // 4. Term
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }),
      }),
    });

    // 5. Storage monitoring
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }),
      }),
    });
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });

    // 6. Keep alive
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [] }) }),
    });

    // 7. Upsert final run
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });

    const result = await executeRetentionAndMaintenance();

    expect(result.success).toBe(true);
    // 2 photos from loan-normal + 1 photo from loan-resolved-issue = 3 deleted photos
    expect(result.retention_results.deleted_loan_photos).toBe(3);
    expect(mockStorageRemove).toHaveBeenCalledWith([
      'loans/borrow_normal.jpg',
      'loans/return_normal.jpg',
    ]);
    expect(mockStorageRemove).toHaveBeenCalledWith(['loans/borrow_resolved.jpg']);
    // Unresolved issue photos were preserved
    expect(mockStorageRemove).not.toHaveBeenCalledWith(
      expect.arrayContaining(['loans/borrow_issue.jpg'])
    );
  });

  it('R-05: Handles missing storage object gracefully without aborting and nullifies DB reference', async () => {
    // 0. Concurrency check
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    });
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });

    // 1. Doc photos: 1 student whose file is already missing on storage
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'std-already-gone',
              verification_document_path: 'documents/ghost.jpg',
              registration_status: 'ACTIVE',
              created_at: new Date().toISOString(),
            },
          ],
        }),
      }),
    });

    // Storage remove returns "Object not found" error
    mockStorageRemove.mockResolvedValueOnce({
      data: null,
      error: { message: 'The resource was not found' },
    });

    // DB update should still happen to clean up the dangling reference
    const mockDocUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockAdminFrom.mockReturnValueOnce({ update: mockDocUpdate });

    // Rest of queries empty
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ not: vi.fn().mockReturnValue({ lte: vi.fn().mockResolvedValue({ data: [] }) }) }),
      }),
    });
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ lte: vi.fn().mockResolvedValue({ data: [] }) }) }),
      }),
    });
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }),
    });
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }),
    });
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [] }) }),
    });
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });

    const result = await executeRetentionAndMaintenance();

    expect(result.success).toBe(true);
    expect(result.retention_results.deleted_document_photos).toBe(1);
    expect(mockDocUpdate).toHaveBeenCalledWith({ verification_document_path: null });
  });

  it('R-06: Revokes expired class leaders, increments qr_token_version, and records audit log when semester ends', async () => {
    // 0. Concurrency check
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }),
    });
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });

    // 1-3. Empty docs, faces, loans
    mockAdminFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [] }) }) });
    mockAdminFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockReturnValue({ lte: vi.fn().mockResolvedValue({ data: [] }) }) }) }) });
    mockAdminFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ lte: vi.fn().mockResolvedValue({ data: [] }) }) }) }) });

    // 4. Academic term has expired!
    const pastTermEnd = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { value: { current_term: '2026/2027-GANJIL', term_ends_at: pastTermEnd } },
          }),
        }),
      }),
    });

    // Classes with active leaders
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'cls-1',
              leader_student_id: 'std-leader-1',
              academic_term: '2026/2027-GANJIL',
            },
          ],
        }),
      }),
    });

    // Student token version query
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { qr_token_version: 3 } }),
        }),
      }),
    });

    // Student token version increment update
    const mockStudentUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockAdminFrom.mockReturnValueOnce({ update: mockStudentUpdate });

    // Release leader on classes
    const mockClassUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockAdminFrom.mockReturnValueOnce({ update: mockClassUpdate });

    // 5-7. Storage monitoring, keep alive, final status
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }),
    });
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [] }) }),
    });
    mockAdminFrom.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue({ error: null }) });

    const result = await executeRetentionAndMaintenance();

    expect(result.success).toBe(true);
    expect(result.retention_results.expired_leaders_revoked).toBe(1);
    expect(mockStudentUpdate).toHaveBeenCalledWith({ qr_token_version: 4 });
    expect(mockClassUpdate).toHaveBeenCalledWith({ leader_student_id: null, leader_since: null });
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'LEADER_REVOKED',
        entityType: 'classes',
        entityId: 'cls-1',
        metadata: expect.objectContaining({ reason: 'SEMESTER_EXPIRED' }),
      })
    );
  });
});
