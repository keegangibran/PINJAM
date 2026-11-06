import { describe, it, expect } from 'vitest';
import {
  sanitizeAuditMetadata,
  prepareAuditEntry,
  recordAuditLog,
  type AuditLogParams,
} from '@/lib/audit';

describe('Audit Logging Module (src/lib/audit.ts)', () => {
  it('D-1: Membersihkan kunci metadata sensitif dan PII (password, token, nim, nik, base64)', () => {
    const rawMetadata = {
      projector_code: 'SPX-001',
      condition: 'NORMAL',
      password: 'super_secret_password',
      token: 'jwt.token.secret',
      student_token: 'signed.hs256.token',
      nim: '4223121001',
      nik: '1271010000000001',
      face_photo_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      authorization: 'Bearer secret_token',
      nested: {
        method: 'QR',
        secret_key: 'should_be_stripped',
      },
    };

    const sanitized = sanitizeAuditMetadata(rawMetadata);

    expect(sanitized.projector_code).toBe('SPX-001');
    expect(sanitized.condition).toBe('NORMAL');

    // Kunci sensitif harus dibersihkan
    expect(sanitized).not.toHaveProperty('password');
    expect(sanitized).not.toHaveProperty('token');
    expect(sanitized).not.toHaveProperty('student_token');
    expect(sanitized).not.toHaveProperty('nim');
    expect(sanitized).not.toHaveProperty('nik');
    expect(sanitized).not.toHaveProperty('face_photo_base64');
    expect(sanitized).not.toHaveProperty('authorization');

    // Field nested harus dibersihkan
    expect(sanitized.nested).toEqual({ method: 'QR' });
  });

  it('D-2: Mengabaikan string berukuran sangat besar (>500 karakter) yang menyerupai payload biner', () => {
    const largePayload = 'A'.repeat(600);
    const metadata = {
      note: 'Normal note',
      suspicious_large_data: largePayload,
    };

    const sanitized = sanitizeAuditMetadata(metadata);
    expect(sanitized.note).toBe('Normal note');
    expect(sanitized).not.toHaveProperty('suspicious_large_data');
  });

  it('D-3: Menyiapkan entri audit log terstruktur (prepareAuditEntry)', () => {
    const params: AuditLogParams = {
      action: 'PHOTO_SIGNED_URL',
      entityType: 'storage',
      entityId: 'faces/student_123.jpg',
      actorStaffId: 'staff-uuid-001',
      metadata: {
        path: 'faces/student_123.jpg',
        purpose: 'Visual verification',
      },
    };

    const entry = prepareAuditEntry(params);

    expect(entry.action).toBe('PHOTO_SIGNED_URL');
    expect(entry.entity_type).toBe('storage');
    expect(entry.entity_id).toBe('faces/student_123.jpg');
    expect(entry.actor_staff_id).toBe('staff-uuid-001');
    expect(entry.actor_student_id).toBeNull();
    expect(entry.metadata).toEqual({
      path: 'faces/student_123.jpg',
      purpose: 'Visual verification',
    });
    expect(typeof entry.created_at).toBe('string');
    expect(new Date(entry.created_at).getTime()).toBeGreaterThan(0);
  });

  it('D-4: Mengembalikan respons kegagalan deterministik saat kueri database gagal', async () => {
    // Mock SupabaseClient yang gagal insert
    const mockSupabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { message: 'Database connection timeout' },
            }),
          }),
        }),
      }),
    };

    const result = await recordAuditLog(mockSupabase as any, {
      action: 'SETTINGS_UPDATED',
      entityType: 'app_settings',
      entityId: 'operational_hours',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database connection timeout');
  });
});

