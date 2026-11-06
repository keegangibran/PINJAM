import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getProjectors, POST as createProjector } from '@/app/api/admin/projectors/route';
import { PATCH as updateProjector } from '@/app/api/admin/projectors/[id]/route';
import { PATCH as updateProjectorStatus } from '@/app/api/admin/projectors/[id]/status/route';
import { GET as getProjectorLogs } from '@/app/api/admin/projectors/[id]/logs/route';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

const mockAdminFrom = vi.fn();
const mockStorageUpload = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    storage: {
      from: vi.fn(() => ({
        upload: mockStorageUpload,
      })),
    },
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ success: true, id: 'audit-log-1' }),
}));

describe('Admin Projector Asset & Maintenance API Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    vi.spyOn(guards, 'requireStaff').mockResolvedValue({
      userId: 'usr-staff',
      email: 'staff@kampus.ac.id',
      role: 'STAFF',
      staffProfile: { id: 'stf-1', name: 'Petugas TU', role: 'STAFF', isActive: true },
    });

    vi.spyOn(guards, 'requireAdmin').mockResolvedValue({
      userId: 'usr-admin',
      email: 'admin@kampus.ac.id',
      role: 'ADMIN',
      staffProfile: { id: 'stf-admin', name: 'Admin Utama', role: 'ADMIN', isActive: true },
    });
  });

  describe('GET /api/admin/projectors', () => {
    it('returns list of projectors with active loan status', async () => {
      const sampleProjectors = [
        {
          id: 'prj-1',
          code: 'PROJ-01',
          name: 'Epson EB-X400 #1',
          status: 'BORROWED',
          notes: null,
          created_at: '2026-11-06T00:00:00Z',
          updated_at: '2026-11-06T00:00:00Z',
          loans: [
            {
              id: 'loan-1',
              status: 'ACTIVE',
              borrowed_at: '2026-11-06T08:00:00Z',
              due_at: '2026-11-06T17:00:00Z',
              student: { id: 'std-1', name: 'Keegan', nim: '4223121001' },
            },
          ],
        },
      ];

      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: sampleProjectors, error: null }),
        }),
      });

      const res = await getProjectors();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.projectors).toHaveLength(1);
      expect(data.projectors[0].code).toBe('PROJ-01');
      expect(data.projectors[0].active_loan).not.toBeNull();
      expect(data.projectors[0].active_loan.student.name).toBe('Keegan');
    });
  });

  describe('POST /api/admin/projectors (Create Projector Asset)', () => {
    it('rejects duplicate projector code with 409', async () => {
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'prj-existing' } }),
          }),
        }),
      });

      const req = new NextRequest('http://localhost/api/admin/projectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'PROJ-01',
          name: 'Epson EB-X400 #1',
        }),
      });

      const res = await createProjector(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe('PROJECTOR_CODE_EXISTS');
    });

    it('successfully creates new projector asset and records initial status log and audit log', async () => {
      // 1. Check existing
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      });

      // 2. Insert projector
      const createdUnit = {
        id: 'prj-new',
        code: 'PROJ-02',
        name: 'BenQ MX550 #2',
        status: 'AVAILABLE',
        notes: 'Unit baru',
      };
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: createdUnit, error: null }),
          }),
        }),
      });

      // 3. Insert status log
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

      const req = new NextRequest('http://localhost/api/admin/projectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'PROJ-02',
          name: 'BenQ MX550 #2',
          notes: 'Unit baru',
        }),
      });

      const res = await createProjector(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.projector.code).toBe('PROJ-02');
      expect(audit.recordAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'PROJECTOR_ASSET_MODIFIED',
          entityType: 'projectors',
          entityId: 'prj-new',
        })
      );
    });
  });

  describe('PATCH /api/admin/projectors/[id] (Edit & Deactivate)', () => {
    it('rejects deactivation when unit is currently in an ACTIVE loan', async () => {
      // 1. Fetch projector
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'prj-1', code: 'PROJ-01', name: 'Epson', status: 'BORROWED' },
              error: null,
            }),
          }),
        }),
      });

      // 2. Check active loans -> returns an active loan
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'loan-123' } }),
            }),
          }),
        }),
      });

      const req = new NextRequest('http://localhost/api/admin/projectors/prj-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deactivate: true }),
      });

      const res = await updateProjector(req, { params: Promise.resolve({ id: 'prj-1' }) });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('CANNOT_DEACTIVATE_BORROWED_UNIT');
    });

    it('successfully deactivates projector when no active loan exists', async () => {
      // 1. Fetch projector
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'prj-1', code: 'PROJ-01', name: 'Epson', status: 'AVAILABLE' },
              error: null,
            }),
          }),
        }),
      });

      // 2. Check active loans -> none
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
      });

      // 3. Update projector
      mockAdminFrom.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'prj-1', code: 'PROJ-01', status: 'INACTIVE' },
                error: null,
              }),
            }),
          }),
        }),
      });

      // 4. Insert status log
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

      const req = new NextRequest('http://localhost/api/admin/projectors/prj-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deactivate: true }),
      });

      const res = await updateProjector(req, { params: Promise.resolve({ id: 'prj-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.projector.status).toBe('INACTIVE');
    });
  });

  describe('PATCH /api/admin/projectors/[id]/status (Maintenance Toggle & Status Logs)', () => {
    it('rejects status change if projector is currently BORROWED', async () => {
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'prj-1', code: 'PROJ-01', status: 'BORROWED' },
              error: null,
            }),
          }),
        }),
      });

      const req = new NextRequest('http://localhost/api/admin/projectors/prj-1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'MAINTENANCE',
          reason: 'Lampu bermasalah',
        }),
      });

      const res = await updateProjectorStatus(req, { params: Promise.resolve({ id: 'prj-1' }) });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('CANNOT_MANUALLY_CHANGE_BORROWED_STATUS');
    });

    it('successfully changes status to MAINTENANCE with reason', async () => {
      // 1. Fetch projector
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'prj-1', code: 'PROJ-01', status: 'AVAILABLE' },
              error: null,
            }),
          }),
        }),
      });

      // 2. Update projector
      mockAdminFrom.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'prj-1', code: 'PROJ-01', status: 'MAINTENANCE', notes: 'Kipas bunyi keras' },
                error: null,
              }),
            }),
          }),
        }),
      });

      // 3. Insert status log
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

      const req = new NextRequest('http://localhost/api/admin/projectors/prj-1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'MAINTENANCE',
          reason: 'Kipas bunyi keras',
        }),
      });

      const res = await updateProjectorStatus(req, { params: Promise.resolve({ id: 'prj-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.projector.status).toBe('MAINTENANCE');
      expect(audit.recordAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'PROJECTOR_STATUS_CHANGED',
          entityType: 'projectors',
          entityId: 'prj-1',
        })
      );
    });

    it('resolves reported issue loans when transitioning from MAINTENANCE to AVAILABLE', async () => {
      // 1. Fetch projector
      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'prj-1', code: 'PROJ-01', status: 'MAINTENANCE' },
              error: null,
            }),
          }),
        }),
      });

      // 2. Update projector
      mockAdminFrom.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'prj-1', code: 'PROJ-01', status: 'AVAILABLE', notes: 'Selesai servis' },
                error: null,
              }),
            }),
          }),
        }),
      });

      // 3. Insert status log
      mockAdminFrom.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

      // 4. Update loans issue_resolved_at
      const mockLoansUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });
      mockAdminFrom.mockReturnValueOnce({
        update: mockLoansUpdate,
      });

      const req = new NextRequest('http://localhost/api/admin/projectors/prj-1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'AVAILABLE',
          reason: 'Selesai servis',
        }),
      });

      const res = await updateProjectorStatus(req, { params: Promise.resolve({ id: 'prj-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.projector.status).toBe('AVAILABLE');
      expect(mockLoansUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ issue_resolved_at: expect.any(String) })
      );
    });
  });

  describe('GET /api/admin/projectors/[id]/logs', () => {
    it('returns chronological status change logs for projector', async () => {
      const sampleLogs = [
        {
          id: 'log-1',
          from_status: 'AVAILABLE',
          to_status: 'MAINTENANCE',
          reason: 'Kabel rusak',
          created_at: '2026-11-06T10:00:00Z',
          staff: { id: 'stf-1', name: 'Petugas TU', role: 'STAFF' },
        },
      ];

      mockAdminFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: sampleLogs, error: null }),
          }),
        }),
      });

      const req = new NextRequest('http://localhost/api/admin/projectors/prj-1/logs');
      const res = await getProjectorLogs(req, { params: Promise.resolve({ id: 'prj-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.logs).toHaveLength(1);
      expect(data.logs[0].from_status).toBe('AVAILABLE');
      expect(data.logs[0].to_status).toBe('MAINTENANCE');
    });
  });
});
