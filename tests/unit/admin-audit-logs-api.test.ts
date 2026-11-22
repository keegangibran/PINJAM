import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getAuditLogs } from '@/app/api/admin/audit-logs/route';
import * as guards from '@/lib/auth/guards';
import { NextRequest } from 'next/server';

// Mocks
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

describe('Admin Audit Logs API Unit Tests (GAP-03 / FR-19)', () => {
  const adminContext: guards.UserAuthContext = {
    userId: 'usr-admin-1',
    email: 'admin.utama@unimed.ac.id',
    role: 'ADMIN',
    staffProfile: {
      id: 'stf-admin-1',
      name: 'Admin Utama TU',
      role: 'ADMIN',
      isActive: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guards, 'requireAdmin').mockResolvedValue(adminContext);
  });

  describe('1. Role Authorization & Authentication Guards', () => {
    it('menolak akses pengguna tidak terotentikasi (401 UNAUTHORIZED)', async () => {
      vi.spyOn(guards, 'requireAdmin').mockRejectedValueOnce(
        new guards.AuthError('Sesi tidak ditemukan atau telah kedaluwarsa.', 401, 'UNAUTHORIZED')
      );

      const req = new NextRequest('http://localhost/api/admin/audit-logs');
      const res = await getAuditLogs(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('menolak akses peran STAFF biasa dengan 403 FORBIDDEN_ADMIN_ONLY', async () => {
      vi.spyOn(guards, 'requireAdmin').mockRejectedValueOnce(
        new guards.AuthError('Operasi ini hanya diizinkan untuk peran Administrator.', 403, 'FORBIDDEN_ADMIN_ONLY')
      );

      const req = new NextRequest('http://localhost/api/admin/audit-logs');
      const res = await getAuditLogs(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN_ADMIN_ONLY');
    });

    it('menolak akses peran Mahasiswa dengan 403 FORBIDDEN_ADMIN_ONLY', async () => {
      vi.spyOn(guards, 'requireAdmin').mockRejectedValueOnce(
        new guards.AuthError('Operasi ini hanya diizinkan untuk peran Administrator.', 403, 'FORBIDDEN_ADMIN_ONLY')
      );

      const req = new NextRequest('http://localhost/api/admin/audit-logs');
      const res = await getAuditLogs(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN_ADMIN_ONLY');
    });
  });

  describe('2. Query Validation & Filtering', () => {
    it('menolak parameter query tidak valid seperti limit di luar batas (> 100)', async () => {
      const req = new NextRequest('http://localhost/api/admin/audit-logs?limit=500');
      const res = await getAuditLogs(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('INVALID_QUERY_PARAMS');
    });

    it('menolak aktor_type yang tidak dikenal', async () => {
      const req = new NextRequest('http://localhost/api/admin/audit-logs?actor_type=HACKER');
      const res = await getAuditLogs(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('INVALID_QUERY_PARAMS');
    });
  });

  describe('3. Data Retrieval, Transformation, & Sanitization', () => {
    it('mengembalikan daftar log audit lengkap dengan aktor terformat dan pagination', async () => {
      const sampleLogs = [
        {
          id: 'log-1',
          action: 'LOAN_BORROWED',
          entity_type: 'loans',
          entity_id: 'loan-123',
          metadata: {
            projector_code: 'PJ-01',
            student_nim: '220101001', // harus disanitasi
            secret_token: 'rahasia123', // harus dibuang
            condition: 'NORMAL',
          },
          created_at: '2026-11-22T08:00:00Z',
          actor_staff_id: 'stf-admin-1',
          actor_student_id: null,
          actor_staff: {
            id: 'stf-admin-1',
            name: 'Admin Utama TU',
            role: 'ADMIN',
          },
          actor_student: null,
        },
        {
          id: 'log-2',
          action: 'QR_REVOKED',
          entity_type: 'students',
          entity_id: 'std-2',
          metadata: {
            reason: 'Emergency revocation',
            token: 'eyJhbGciOi...', // harus dibuang
          },
          created_at: '2026-11-22T07:30:00Z',
          actor_staff_id: null,
          actor_student_id: 'std-2',
          actor_staff: null,
          actor_student: {
            id: 'std-2',
            name: 'Budi Mahasiswa',
          },
        },
        {
          id: 'log-3',
          action: 'RETENTION_CLEANUP_EXECUTED',
          entity_type: 'storage',
          entity_id: null,
          metadata: {
            cleaned_photos_count: 5,
          },
          created_at: '2026-11-22T00:00:00Z',
          actor_staff_id: null,
          actor_student_id: null,
          actor_staff: null,
          actor_student: null,
        },
      ];

      // Setup chainable mock Supabase PostgREST
      const mockQueryBuilder: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValueOnce({
          data: sampleLogs,
          count: 3,
          error: null,
        }),
      };

      mockAdminFrom.mockReturnValue(mockQueryBuilder);

      const req = new NextRequest('http://localhost/api/admin/audit-logs?page=1&limit=20');
      const res = await getAuditLogs(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(3);

      // Verifikasi Pagination
      expect(json.pagination.page).toBe(1);
      expect(json.pagination.limit).toBe(20);
      expect(json.pagination.total).toBe(3);
      expect(json.pagination.total_pages).toBe(1);

      // Verifikasi Log 1 (Aktor Admin)
      const log1 = json.data[0];
      expect(log1.action).toBe('LOAN_BORROWED');
      expect(log1.actor.type).toBe('ADMIN');
      expect(log1.actor.name).toBe('Admin Utama TU');
      expect(log1.metadata.projector_code).toBe('PJ-01');
      // SANITASI KEAMANAN: Memastikan token dan password tidak bocor
      expect(log1.metadata.secret_token).toBeUndefined();
      expect(log1.metadata.student_nim).toBeUndefined();

      // Verifikasi Log 2 (Aktor Mahasiswa)
      const log2 = json.data[1];
      expect(log2.action).toBe('QR_REVOKED');
      expect(log2.actor.type).toBe('STUDENT');
      expect(log2.actor.name).toBe('Budi Mahasiswa');
      expect(log2.metadata.token).toBeUndefined();

      // Verifikasi Log 3 (Aktor Sistem Otomatis / Background)
      const log3 = json.data[2];
      expect(log3.action).toBe('RETENTION_CLEANUP_EXECUTED');
      expect(log3.actor.type).toBe('SYSTEM');
      expect(log3.actor.name).toContain('Sistem Otomatis');
      expect(log3.metadata.cleaned_photos_count).toBe(5);
    });

    it('menerapkan filter action, entity_type, dan rentang tanggal dengan benar', async () => {
      const mockQueryBuilder: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
      };
      mockQueryBuilder.range.mockResolvedValueOnce({
        data: [],
        count: 0,
        error: null,
      });

      mockAdminFrom.mockReturnValue(mockQueryBuilder);

      const req = new NextRequest(
        'http://localhost/api/admin/audit-logs?action=LOAN_BORROWED&entity_type=loans&start_date=2026-11-01&end_date=2026-11-22&actor_type=STAFF'
      );
      const res = await getAuditLogs(req);

      expect(res.status).toBe(200);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('action', 'LOAN_BORROWED');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('entity_type', 'loans');
      expect(mockQueryBuilder.gte).toHaveBeenCalledWith('created_at', '2026-11-01');
      expect(mockQueryBuilder.lte).toHaveBeenCalledWith('created_at', '2026-11-22T23:59:59.999Z');
      expect(mockQueryBuilder.not).toHaveBeenCalledWith('actor_staff_id', 'is', null);
    });
  });
});
