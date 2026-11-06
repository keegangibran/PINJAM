import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

import { GET as cronGet, POST as cronPost } from '@/app/api/cron/retention/route';
import * as retention from '@/lib/retention';
import * as guards from '@/lib/auth/guards';

describe('Vercel Cron Retention API (/api/cron/retention)', () => {
  const TEST_CRON_SECRET = 'super-secret-cron-token-12345';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = TEST_CRON_SECRET;
  });

  describe('GET /api/cron/retention (Scheduled Vercel Cron Trigger)', () => {
    it('rejects request with missing Authorization header (401)', async () => {
      const req = new NextRequest('http://localhost/api/cron/retention');
      const res = await cronGet(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED_CRON');
    });

    it('rejects request with incorrect Bearer secret (401)', async () => {
      const req = new NextRequest('http://localhost/api/cron/retention', {
        headers: { authorization: 'Bearer wrong-secret' },
      });
      const res = await cronGet(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED_CRON');
    });

    it('executes retention process when valid CRON_SECRET is provided', async () => {
      const mockResult: retention.RetentionExecutionResult = {
        success: true,
        timestamp: '2026-11-07T02:00:00Z',
        retention_results: {
          deleted_document_photos: 3,
          deleted_face_photos: 1,
          deleted_loan_photos: 2,
          expired_leaders_revoked: 1,
        },
        storage_monitoring: {
          usage_bytes: 52428800, // 50 MB
          usage_pct: 4.88,
          warning_active: false,
          max_capacity_bytes: 1073741824,
        },
        keep_alive: true,
        failures: [],
      };

      vi.spyOn(retention, 'executeRetentionAndMaintenance').mockResolvedValueOnce(mockResult);

      const req = new NextRequest('http://localhost/api/cron/retention', {
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      });
      const res = await cronGet(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.retention_results.deleted_document_photos).toBe(3);
      expect(data.storage_monitoring.usage_pct).toBe(4.88);
    });

    it('returns 409 conflict when another cron instance is currently running', async () => {
      vi.spyOn(retention, 'executeRetentionAndMaintenance').mockResolvedValueOnce({
        success: false,
        code: 'CRON_ALREADY_RUNNING',
        timestamp: '2026-11-07T02:00:00Z',
        retention_results: {
          deleted_document_photos: 0,
          deleted_face_photos: 0,
          deleted_loan_photos: 0,
          expired_leaders_revoked: 0,
        },
        storage_monitoring: {
          usage_bytes: 0,
          usage_pct: 0,
          warning_active: false,
          max_capacity_bytes: 1073741824,
        },
        keep_alive: true,
        failures: ['Tugas pembersihan retensi sedang berjalan di proses lain.'],
      });

      const req = new NextRequest('http://localhost/api/cron/retention', {
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      });
      const res = await cronGet(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe('CRON_ALREADY_RUNNING');
    });
  });

  describe('POST /api/cron/retention (Manual Admin Maintenance Trigger)', () => {
    it('allows manual trigger by authenticated Admin role', async () => {
      vi.spyOn(guards, 'requireAdmin').mockResolvedValueOnce({
        userId: 'usr-admin',
        email: 'admin@kampus.ac.id',
        role: 'ADMIN',
        staffProfile: { id: 'stf-admin', name: 'Admin Utama', role: 'ADMIN', isActive: true },
      });

      vi.spyOn(retention, 'executeRetentionAndMaintenance').mockResolvedValueOnce({
        success: true,
        timestamp: '2026-11-07T02:00:00Z',
        retention_results: {
          deleted_document_photos: 0,
          deleted_face_photos: 0,
          deleted_loan_photos: 0,
          expired_leaders_revoked: 0,
        },
        storage_monitoring: {
          usage_bytes: 1000,
          usage_pct: 0.01,
          warning_active: false,
          max_capacity_bytes: 1073741824,
        },
        keep_alive: true,
        failures: [],
      });

      const req = new NextRequest('http://localhost/api/cron/retention', {
        method: 'POST',
      });
      const res = await cronPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('rejects manual trigger when caller is not an Admin', async () => {
      vi.spyOn(guards, 'requireAdmin').mockRejectedValueOnce(
        new guards.AuthError('Akses ditolak: Operasi administratif ini hanya diizinkan untuk peran Administrator.', 403, 'FORBIDDEN_ADMIN_ONLY')
      );

      const req = new NextRequest('http://localhost/api/cron/retention', {
        method: 'POST',
      });
      const res = await cronPost(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error.code).toBe('CRON_EXECUTION_FAILED');
    });
  });
});
