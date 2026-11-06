import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as processTransaction } from '@/app/api/kiosk/transaction/route';
import * as guards from '@/lib/auth/guards';

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
const mockStorageUpload = vi.fn().mockResolvedValue({ data: { path: 'loans/sample.jpg' }, error: null });

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
    storage: {
      from: vi.fn(() => ({
        upload: mockStorageUpload,
      })),
    },
  })),
}));

describe('Kiosk Transaction API Unit Tests (FR-06, FR-07, NFR-02, NFR-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

    vi.spyOn(guards, 'requireStaff').mockResolvedValue({
      userId: 'usr-staff-1',
      email: 'petugas@unimed.ac.id',
      role: 'STAFF',
      staffProfile: { id: 'stf-1', name: 'Petugas Loket', role: 'STAFF', isActive: true },
    });
  });

  it('rejects oversized photo (> 250 KB) with 400 IMAGE_TOO_LARGE (NFR-02)', async () => {
    // Generate a base64 string larger than 250 KB (approx 350,000 chars)
    const largeBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(360000);

    const req = new Request('http://localhost/api/kiosk/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: 'idem-key-toolarge-12345',
        projector_code: 'PROJ-001',
        photo_base64: largeBase64,
        condition: 'NORMAL',
      }),
    });

    const res = await processTransaction(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('IMAGE_TOO_LARGE');
  });

  it('rejects invalid photo MIME type with 400 INVALID_MIME_TYPE', async () => {
    const invalidMimeBase64 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    const req = new Request('http://localhost/api/kiosk/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: 'idem-key-badmime-12345',
        projector_code: 'PROJ-001',
        photo_base64: invalidMimeBase64,
        condition: 'NORMAL',
      }),
    });

    const res = await processTransaction(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('INVALID_MIME_TYPE');
  });

  it('rejects idempotency key reuse with different projector code with 409 IDEMPOTENCY_CONFLICT', async () => {
    const validBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    // Mock idempotency check finds existing loan with code PROJ-001
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'loan-prev-1',
          status: 'ACTIVE',
          projector_id: 'proj-1',
          projectors: { code: 'PROJ-001' },
        },
      }),
    }));

    // Send same idempotency key for PROJ-002
    const req = new Request('http://localhost/api/kiosk/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: 'idem-key-duplicate-reuse-12345',
        projector_code: 'PROJ-002', // Different code!
        photo_base64: validBase64,
        condition: 'NORMAL',
      }),
    });

    const res = await processTransaction(req);
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('returns stored transaction on identical idempotency key replay', async () => {
    const validBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    // Mock idempotency check finds existing loan with same code PROJ-001
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'loan-prev-1',
          status: 'ACTIVE',
          projector_id: 'proj-1',
          projectors: { code: 'PROJ-001' },
        },
      }),
    }));

    const req = new Request('http://localhost/api/kiosk/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: 'idem-key-replay-12345',
        projector_code: 'PROJ-001',
        photo_base64: validBase64,
        condition: 'NORMAL',
      }),
    });

    const res = await processTransaction(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.idempotent_replay).toBe(true);
    expect(json.data.action).toBe('BORROW');
  });

  it('rejects borrow transaction if kiosk_session_id is missing', async () => {
    const validBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    // 1. Mock idempotency check: not found
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }),
    }));

    // 2. Mock projector is AVAILABLE
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: { id: 'proj-1', code: 'PROJ-001', status: 'AVAILABLE' },
      }),
    }));

    const req = new Request('http://localhost/api/kiosk/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: 'idem-key-noborrow-12345',
        projector_code: 'PROJ-001',
        photo_base64: validBase64,
        condition: 'NORMAL',
        // kiosk_session_id is omitted!
      }),
    });

    const res = await processTransaction(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('SESSION_REQUIRED');
  });

  it('rejects return transaction if returner is representative but name is empty (FR-07)', async () => {
    const validBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    // 1. Mock idempotency check: not found
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }),
    }));

    // 2. Mock projector is BORROWED
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: { id: 'proj-1', code: 'PROJ-001', status: 'BORROWED' },
      }),
    }));

    const req = new Request('http://localhost/api/kiosk/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: 'idem-key-norepname-12345',
        projector_code: 'PROJ-001',
        photo_base64: validBase64,
        condition: 'NORMAL',
        returner: {
          type: 'REPRESENTATIVE',
          name: '', // Empty name!
        },
      }),
    });

    const res = await processTransaction(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe('REPRESENTATIVE_NAME_REQUIRED');
  });

  it('successfully processes borrow transaction and calls atomic database function', async () => {
    const validBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    // 1. Mock idempotency check: not found
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }),
    }));

    // 2. Mock projector is AVAILABLE
    mockAdminFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: { id: 'proj-1', code: 'PROJ-001', status: 'AVAILABLE' },
      }),
    }));

    // 3. Mock rpc process_loan_transaction
    mockAdminRpc.mockResolvedValueOnce({
      data: {
        success: true,
        action: 'BORROW',
        loan_id: 'loan-new-1',
        projector_code: 'PROJ-001',
        status: 'BORROWED',
        message: 'Peminjaman proyektor berhasil dicatat.',
      },
      error: null,
    });

    const req = new Request('http://localhost/api/kiosk/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: 'idem-key-validborrow-12345',
        projector_code: 'PROJ-001',
        kiosk_session_id: '11111111-1111-4111-a111-111111111111',
        photo_base64: validBase64,
        condition: 'NORMAL',
      }),
    });

    const res = await processTransaction(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.action).toBe('BORROW');
    expect(json.data.status).toBe('BORROWED');

    // Verify storage upload called for loans/ prefix
    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^loans\/proj-001_/),
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/jpeg' })
    );

    // Verify RPC process_loan_transaction called
    expect(mockAdminRpc).toHaveBeenCalledWith(
      'process_loan_transaction',
      expect.objectContaining({
        p_idempotency_key: 'idem-key-validborrow-12345',
        p_projector_code: 'PROJ-001',
        p_condition: 'NORMAL',
        p_kiosk_session_id: '11111111-1111-4111-a111-111111111111',
      })
    );
  });
});
