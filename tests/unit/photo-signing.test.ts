import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as signPhoto } from '@/app/api/admin/photos/sign/route';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

const mockCreateSignedUrl = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));

describe('Photo Signing API Unit Tests (NFR-07, FR-19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guards, 'requireStaff').mockResolvedValue({
      userId: 'usr-staff',
      email: 'petugas@kampus.ac.id',
      role: 'STAFF',
      staffProfile: { id: 'stf-1', name: 'Petugas Budi', role: 'STAFF', isActive: true },
    });
  });

  it('rejects path traversal attempts with 400 INVALID_PATH', async () => {
    const maliciousPaths = [
      '../etc/passwd',
      'faces/../../secret.env',
      '/faces/photo.jpg',
      'faces\\backslash.jpg',
    ];

    for (const path of maliciousPaths) {
      const req = new Request('http://localhost/api/admin/photos/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      const res = await signPhoto(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error.code).toBe('INVALID_PATH');
    }
  });

  it('rejects forbidden directory prefix with 403 FORBIDDEN_PREFIX', async () => {
    const forbiddenPaths = [
      'private/keys.pem',
      'backups/db.dump',
      'system/settings.json',
      'users/profiles/avatar.png',
    ];

    for (const path of forbiddenPaths) {
      const req = new Request('http://localhost/api/admin/photos/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      const res = await signPhoto(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN_PREFIX');
    }
  });

  it('generates 60-second signed URL for valid allowed path and logs audit trail without token leak', async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://supabase.co/storage/v1/object/sign/smartprojex-media/faces/sample.jpg?token=secure123' },
      error: null,
    });

    const req = new Request('http://localhost/api/admin/photos/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'faces/sample.jpg' }),
    });

    const res = await signPhoto(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.expiresIn).toBe(60);
    expect(json.data.signedUrl).toContain('faces/sample.jpg');

    // Verify 60 second TTL passed to storage
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('faces/sample.jpg', 60);

    // Verify audit log recorded without leaking token
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'PHOTO_SIGNED_URL',
        entityType: 'storage',
        entityId: 'faces/sample.jpg',
        actorStaffId: 'stf-1',
        metadata: {
          path: 'faces/sample.jpg',
          expires_in_seconds: 60,
        },
      })
    );
  });
});

