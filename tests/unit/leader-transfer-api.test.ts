import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as transferLeader } from '@/app/api/students/me/leader/transfer/route';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: 'log-transfer-1' }),
}));

describe('Class Leader Transfer API Unit Tests (FR-01E, FT-01, FT-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
    process.env.QR_TOKEN_SECRET = 'super-secret-key-that-is-at-least-32-chars-long!';

    // Default mock rpc returns null so fallback logic executes in tests
    mockAdminRpc.mockResolvedValue({ data: null, error: new Error('RPC not found in mock') });
  });

  it('rejects transfer to oneself with 400 CANNOT_TRANSFER_TO_SELF', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-leader',
      email: 'ketua@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: '11111111-1111-4111-a111-111111111111',
        nim: '220101001',
        name: 'Ketua Sendiri',
        registrationStatus: 'ACTIVE',
        currentClassId: '33333333-3333-4333-a333-333333333333',
      },
    });

    const req = new Request('http://localhost/api/students/me/leader/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_student_id: '11111111-1111-4111-a111-111111111111', // Same ID
      }),
    });

    const res = await transferLeader(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('CANNOT_TRANSFER_TO_SELF');
  });

  it('rejects caller who is not the active class leader with 403 NOT_CLASS_LEADER', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-member',
      email: 'bukan_ketua@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: '11111111-1111-4111-a111-111111111111',
        nim: '220101001',
        name: 'Bukan Ketua',
        registrationStatus: 'ACTIVE',
        currentClassId: '33333333-3333-4333-a333-333333333333',
      },
    });

    // Mock query classes: leader is someone else
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '33333333-3333-4333-a333-333333333333',
          leader_student_id: '99999999-9999-4999-a999-999999999999', // Different leader
          is_active: true,
        },
        error: null,
      }),
    }));

    const req = new Request('http://localhost/api/students/me/leader/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_student_id: '22222222-2222-4222-a222-222222222222',
      }),
    });

    const res = await transferLeader(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error.code).toBe('NOT_CLASS_LEADER');
  });

  it('rejects recipient who is not in the same class with 400 TARGET_NOT_IN_SAME_CLASS', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-leader',
      email: 'ketua@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: '11111111-1111-4111-a111-111111111111',
        nim: '220101001',
        name: 'Ketua Sah',
        registrationStatus: 'ACTIVE',
        currentClassId: '33333333-3333-4333-a333-333333333333',
      },
    });

    // 1. Mock query classes (caller is the leader of class 333)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '33333333-3333-4333-a333-333333333333',
          leader_student_id: '11111111-1111-4111-a111-111111111111',
          is_active: true,
        },
        error: null,
      }),
    }));

    // 2. Mock query target student (belongs to different class 444)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '22222222-2222-4222-a222-222222222222',
          name: 'Mahasiswa Kelas Lain',
          registration_status: 'ACTIVE',
          current_class_id: '44444444-4444-4444-a444-444444444444', // Different class!
        },
        error: null,
      }),
    }));

    const req = new Request('http://localhost/api/students/me/leader/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_student_id: '22222222-2222-4222-a222-222222222222',
      }),
    });

    const res = await transferLeader(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('TARGET_NOT_IN_SAME_CLASS');
  });

  it('rejects recipient who is not ACTIVE with 400 TARGET_NOT_ACTIVE', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-leader',
      email: 'ketua@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: '11111111-1111-4111-a111-111111111111',
        nim: '220101001',
        name: 'Ketua Sah',
        registrationStatus: 'ACTIVE',
        currentClassId: '33333333-3333-4333-a333-333333333333',
      },
    });

    // 1. Mock query classes
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '33333333-3333-4333-a333-333333333333',
          leader_student_id: '11111111-1111-4111-a111-111111111111',
          is_active: true,
        },
        error: null,
      }),
    }));

    // 2. Mock query target student (registration_status = PENDING_VERIFICATION)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '22222222-2222-4222-a222-222222222222',
          name: 'Mahasiswa Belum Terverifikasi',
          registration_status: 'PENDING_VERIFICATION', // Inactive!
          current_class_id: '33333333-3333-4333-a333-333333333333',
        },
        error: null,
      }),
    }));

    const req = new Request('http://localhost/api/students/me/leader/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_student_id: '22222222-2222-4222-a222-222222222222',
      }),
    });

    const res = await transferLeader(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('TARGET_NOT_ACTIVE');
  });

  it('atomically transfers leadership, revokes outgoing leader QR pass (+1 version), and records audit trail', async () => {
    vi.spyOn(guards, 'requireStudent').mockResolvedValueOnce({
      userId: 'usr-leader',
      email: 'ketua@unimed.ac.id',
      role: 'STUDENT',
      studentProfile: {
        id: '11111111-1111-4111-a111-111111111111',
        nim: '220101001',
        name: 'Ketua Lama',
        registrationStatus: 'ACTIVE',
        currentClassId: '33333333-3333-4333-a333-333333333333',
      },
    });

    // 1. Mock query classes (caller is leader)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '33333333-3333-4333-a333-333333333333',
          leader_student_id: '11111111-1111-4111-a111-111111111111',
          is_active: true,
        },
        error: null,
      }),
    }));

    // 2. Mock query target student (valid classmate)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: '22222222-2222-4222-a222-222222222222',
          name: 'Ketua Baru',
          registration_status: 'ACTIVE',
          current_class_id: '33333333-3333-4333-a333-333333333333',
        },
        error: null,
      }),
    }));

    // 3. Mock update classes table
    const updateClassMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      update: updateClassMock,
      eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    }));

    // 4. Mock select caller token version (returns 1)
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: { qr_token_version: 1 },
      }),
    }));

    // 5. Mock update caller token version (+1 -> 2)
    const updateCallerMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      update: updateCallerMock,
      eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    }));

    // 6. Mock insert into class_leader_claims
    const insertClaimMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementationOnce(() => ({
      insert: insertClaimMock,
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: { id: 'clm-transfer-1', status: 'APPROVED' },
        error: null,
      }),
    }));

    const req = new Request('http://localhost/api/students/me/leader/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_student_id: '22222222-2222-4222-a222-222222222222',
        reason: 'Pengunduran diri sebagai ketua',
      }),
    });

    const res = await transferLeader(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.new_leader_id).toBe('22222222-2222-4222-a222-222222222222');
    expect(json.data.caller_new_token_version).toBe(2);

    // Verify class leader updated to target
    expect(updateClassMock).toHaveBeenCalledWith(
      expect.objectContaining({
        leader_student_id: '22222222-2222-4222-a222-222222222222',
      })
    );

    // Verify outgoing leader qr_token_version incremented
    expect(updateCallerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        qr_token_version: 2,
      })
    );

    // Verify transfer claim recorded as APPROVED with null decided_by
    expect(insertClaimMock).toHaveBeenCalledWith(
      expect.objectContaining({
        claim_type: 'TRANSFER',
        status: 'APPROVED',
        decided_by: null,
        student_id: '22222222-2222-4222-a222-222222222222',
      })
    );

    // Verify audit log recorded
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'LEADER_TRANSFERRED',
        entityType: 'classes',
        actorStudentId: '11111111-1111-4111-a111-111111111111',
        metadata: expect.objectContaining({
          previous_leader_id: '11111111-1111-4111-a111-111111111111',
          new_leader_id: '22222222-2222-4222-a222-222222222222',
        }),
      })
    );
  });
});

