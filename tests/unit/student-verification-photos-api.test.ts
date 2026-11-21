import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as uploadVerificationPhotos } from '@/app/api/students/me/verification-photos/route';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

// Mocks
const mockAdminFrom = vi.fn();
const mockStorageUpload = vi.fn().mockResolvedValue({ data: { path: 'sample.jpg' }, error: null });
const mockStorageRemove = vi.fn().mockResolvedValue({ data: [], error: null });

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    storage: {
      from: vi.fn(() => ({
        upload: mockStorageUpload,
        remove: mockStorageRemove,
      })),
    },
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: 'log-123' }),
}));

describe('Student Self-Verification Photos Upload API (POST /api/students/me/verification-photos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    face_photo_base64: 'data:image/jpeg;base64,' + 'A'.repeat(2000),
    document_photo_base64: 'data:image/jpeg;base64,' + 'B'.repeat(2000),
    document_type: 'KTM',
  };

  it('1. Rejects request when student is not authenticated (throws AuthError)', async () => {
    vi.spyOn(guards, 'requireStudent').mockRejectedValueOnce(
      new guards.AuthError('Sesi tidak ditemukan.', 401, 'UNAUTHORIZED')
    );

    const req = new Request('http://localhost/api/students/me/verification-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await uploadVerificationPhotos(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('2. Rejects request with missing or invalid payload', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-student-1',
      email: 'mhs@kampus.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-uuid-1',
        nim: '4223121001',
        name: 'Mahasiswa Test',
        registrationStatus: 'PENDING_DOCUMENT',
        currentClassId: 'cls-1',
      },
    });

    const req = new Request('http://localhost/api/students/me/verification-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        face_photo_base64: '', // Empty!
        document_photo_base64: 'data:image/jpeg;base64,' + 'B'.repeat(200),
        document_type: 'INVALID_TYPE',
      }),
    });

    const res = await uploadVerificationPhotos(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('3. Rejects upload if student status is already ACTIVE', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-student-1',
      email: 'mhs@kampus.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-uuid-1',
        nim: '4223121001',
        name: 'Mahasiswa Test',
        registrationStatus: 'ACTIVE',
        currentClassId: 'cls-1',
      },
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'stu-uuid-1',
          registration_status: 'ACTIVE',
          verification_document_path: null,
          profile_photo_path: 'faces/old.jpg',
        },
        error: null,
      }),
    });

    const req = new Request('http://localhost/api/students/me/verification-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await uploadVerificationPhotos(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error.code).toBe('INVALID_STATUS');
  });

  it('4. Successfully uploads face & document, updates status to PENDING_REVIEW, and records audit log', async () => {
    const studentId = 'stu-uuid-1';

    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-student-1',
      email: 'mhs@kampus.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: studentId,
        nim: '4223121001',
        name: 'Mahasiswa Budi',
        registrationStatus: 'PENDING_DOCUMENT',
        currentClassId: 'cls-1',
      },
    });

    // 1. Ambil data mahasiswa
    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: studentId,
          registration_status: 'PENDING_DOCUMENT',
          verification_document_path: 'documents/old_doc.jpg',
          profile_photo_path: null,
        },
        error: null,
      }),
    });

    // 2. Update status ke PENDING_REVIEW
    const mockEq = vi.fn().mockResolvedValueOnce({ error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    mockAdminFrom.mockReturnValueOnce({
      update: mockUpdate,
    });

    const req = new Request('http://localhost/api/students/me/verification-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await uploadVerificationPhotos(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.registration_status).toBe('PENDING_REVIEW');

    // Pastikan storage mengunggah 2 foto (wajah dan dokumen)
    expect(mockStorageUpload).toHaveBeenCalledTimes(2);

    // Pastikan dokumen lama dibersihkan
    expect(mockStorageRemove).toHaveBeenCalledWith(['documents/old_doc.jpg']);

    // Pastikan database update memperbarui status ke PENDING_REVIEW
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        registration_status: 'PENDING_REVIEW',
        verification_document_type: 'KTM',
      })
    );

    // Pastikan audit log dicatat
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'STUDENT_VERIFICATION_SUBMITTED',
        entityId: studentId,
        actorStudentId: studentId,
      })
    );
  });

  it('5. Rejects upload if email is unverified (registration_status UNVERIFIED_EMAIL and emailConfirmed false)', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-unverified',
      email: 'unconfirmed@kampus.ac.id',
      role: 'STUDENT',
      emailConfirmed: false,
      studentProfile: {
        id: 'stu-unconfirmed',
        nim: '4223121999',
        name: 'Mahasiswa Unverified',
        registrationStatus: 'UNVERIFIED_EMAIL',
        currentClassId: 'cls-1',
      },
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'stu-unconfirmed',
          registration_status: 'UNVERIFIED_EMAIL',
          verification_document_path: null,
          profile_photo_path: null,
        },
        error: null,
      }),
    });

    const req = new Request('http://localhost/api/students/me/verification-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await uploadVerificationPhotos(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('6. Rejects upload if photo size is smaller than 1000 bytes or larger than 2MB', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-size-test',
      email: 'size@kampus.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: 'stu-size',
        nim: '4223121888',
        name: 'Mahasiswa Size',
        registrationStatus: 'PENDING_DOCUMENT',
        currentClassId: 'cls-1',
      },
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'stu-size',
          registration_status: 'PENDING_DOCUMENT',
          verification_document_path: null,
          profile_photo_path: null,
        },
        error: null,
      }),
    });

    const tinyPayload = {
      face_photo_base64: 'data:image/jpeg;base64,' + 'A'.repeat(500), // ~375 bytes, satisfies Zod min(100) but fails MIN_PHOTO_BYTES (1000)
      document_photo_base64: 'data:image/jpeg;base64,' + 'B'.repeat(2000),
      document_type: 'KTM',
    };

    const req = new Request('http://localhost/api/students/me/verification-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tinyPayload),
    });

    const res = await uploadVerificationPhotos(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe('INVALID_FILE_SIZE');
  });

  it('7. Cleans up old face photo from storage on resubmission', async () => {
    const studentId = 'stu-resub';

    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-resub',
      email: 'resub@kampus.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: studentId,
        nim: '4223121777',
        name: 'Mahasiswa Resub',
        registrationStatus: 'RESUBMISSION_REQUIRED',
        currentClassId: 'cls-1',
      },
    });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: studentId,
          registration_status: 'RESUBMISSION_REQUIRED',
          verification_document_path: 'documents/old_doc.jpg',
          profile_photo_path: 'faces/old_face.jpg',
        },
        error: null,
      }),
    });

    const mockEq = vi.fn().mockResolvedValueOnce({ error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    mockAdminFrom.mockReturnValueOnce({
      update: mockUpdate,
    });

    const req = new Request('http://localhost/api/students/me/verification-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await uploadVerificationPhotos(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // Old face and old doc are removed
    expect(mockStorageRemove).toHaveBeenCalledWith(['documents/old_doc.jpg']);
    expect(mockStorageRemove).toHaveBeenCalledWith(['faces/old_face.jpg']);
  });
});
