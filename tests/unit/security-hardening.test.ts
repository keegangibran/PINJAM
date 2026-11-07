import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock server-only before any imports that might pull it in
vi.mock('server-only', () => ({}));

describe('Security Hardening & Phase 8 Remediation Verification', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const migration6Path = path.join(migrationsDir, '20261106000006_security_hardening.sql');
  const migration6Sql = fs.readFileSync(migration6Path, 'utf-8');

  it('SEC-1: Migration 6 mencabut hak eksekusi process_loan_transaction dari PUBLIC/anon/authenticated dan membatasi hanya ke service_role', () => {
    expect(migration6Sql).toContain('REVOKE EXECUTE ON FUNCTION public.process_loan_transaction');
    expect(migration6Sql).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration6Sql).toContain('GRANT EXECUTE ON FUNCTION public.process_loan_transaction');
    expect(migration6Sql).toContain('TO service_role');
  });

  it('SEC-2: Migration 6 mencabut hak eksekusi transfer_class_leader dan revoke_student_qr_pass dari authenticated client', () => {
    expect(migration6Sql).toContain('REVOKE EXECUTE ON FUNCTION public.transfer_class_leader(uuid, uuid, text) FROM PUBLIC, anon, authenticated');
    expect(migration6Sql).toContain('GRANT EXECUTE ON FUNCTION public.transfer_class_leader(uuid, uuid, text) TO service_role');

    expect(migration6Sql).toContain('REVOKE EXECUTE ON FUNCTION public.revoke_student_qr_pass(uuid) FROM PUBLIC, anon, authenticated');
    expect(migration6Sql).toContain('GRANT EXECUTE ON FUNCTION public.revoke_student_qr_pass(uuid) TO service_role');
  });

  it('SEC-3: Migration 6 memperkuat search_path pada fungsi trigger handle_updated_at', () => {
    expect(migration6Sql).toContain('CREATE OR REPLACE FUNCTION public.handle_updated_at()');
    expect(migration6Sql).toContain('SET search_path = public, pg_temp');
  });

  it('SEC-4: Migration 6 menambahkan kebijakan RLS anon_read_active_classes untuk kelas aktif', () => {
    expect(migration6Sql).toContain('CREATE POLICY "anon_read_active_classes" ON public.classes');
    expect(migration6Sql).toContain('FOR SELECT TO anon');
    expect(migration6Sql).toContain('USING (is_active = true)');
  });

  it('SEC-5: Migration 6 mendefinisikan fungsi atomik acquire_retention_lock dan release_retention_lock', () => {
    expect(migration6Sql).toContain('CREATE OR REPLACE FUNCTION public.acquire_retention_lock');
    expect(migration6Sql).toContain('CREATE OR REPLACE FUNCTION public.release_retention_lock');
    expect(migration6Sql).toContain('FOR UPDATE'); // Row-level locking on app_settings
    expect(migration6Sql).toContain('REVOKE EXECUTE ON FUNCTION public.acquire_retention_lock');
    expect(migration6Sql).toContain('TO service_role');
  });
});

describe('GET /api/classes Unauthenticated Access & Admin Client Verification', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('SEC-6: Endpoint GET /api/classes memuat kelas aktif menggunakan createAdminClient() tanpa session barrier', async () => {
    const mockOrder3 = vi.fn().mockResolvedValue({
      data: [
        {
          id: '11111111-1111-4111-a111-111111111111',
          study_program: 'Informatika',
          cohort_year: 2024,
          section: 'IF-1A',
          academic_term: '2025/2026-GANJIL',
          is_active: true,
        },
      ],
      error: null,
    });
    const mockOrder2 = vi.fn().mockReturnValue({ order: mockOrder3 });
    const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 });
    const mockOrder0 = vi.fn().mockReturnValue({ order: mockOrder1 });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder0 });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    const mockAdminClient = {
      from: vi.fn().mockReturnValue({
        select: mockSelect,
      }),
    };

    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => mockAdminClient,
    }));

    const { GET } = await import('@/app/api/classes/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].section).toBe('IF-1A');
    expect(mockAdminClient.from).toHaveBeenCalledWith('classes');
    expect(mockEq).toHaveBeenCalledWith('is_active', true);
  });
});
