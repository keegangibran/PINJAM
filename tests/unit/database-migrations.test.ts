import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Database SQL Migrations & Schema Validation', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const seedFile = path.resolve(__dirname, '../../supabase/seed.sql');

  const migration1Path = path.join(migrationsDir, '20261106000001_initial_schema.sql');
  const migration2Path = path.join(migrationsDir, '20261106000002_rls_policies.sql');
  const migration3Path = path.join(migrationsDir, '20261106000003_storage_setup.sql');
  const migration4Path = path.join(migrationsDir, '20261106000004_atomic_transactions.sql');
  const migration5Path = path.join(migrationsDir, '20261106000005_class_leader_transfer.sql');

  const migration1Sql = fs.readFileSync(migration1Path, 'utf-8');
  const migration2Sql = fs.readFileSync(migration2Path, 'utf-8');
  const migration3Sql = fs.readFileSync(migration3Path, 'utf-8');
  const migration4Sql = fs.readFileSync(migration4Path, 'utf-8');
  const migration5Sql = fs.readFileSync(migration5Path, 'utf-8');
  const seedSql = fs.readFileSync(seedFile, 'utf-8');

  it('E-1: Migration 1 mendefinisikan seluruh 10 tabel domain yang diwajibkan PRD', () => {
    const requiredTables = [
      'staff_profiles',
      'classes',
      'students',
      'class_leader_claims',
      'projectors',
      'projector_status_logs',
      'loans',
      'audit_logs',
      'kiosk_sessions',
      'app_settings',
    ];

    for (const table of requiredTables) {
      expect(migration1Sql).toContain(`CREATE TABLE public.${table}`);
    }
  });

  it('E-2: Migration 1 mengimplementasikan empat Partial Unique Index wajib', () => {
    // 1. Satu NIM aktif
    expect(migration1Sql).toMatch(/CREATE UNIQUE INDEX idx_students_active_nim[\s\S]*?WHERE registration_status = 'ACTIVE'/);

    // 2. Satu pinjaman aktif per proyektor
    expect(migration1Sql).toMatch(/CREATE UNIQUE INDEX idx_loans_active_projector[\s\S]*?WHERE status = 'ACTIVE'/);

    // 3. Satu pinjaman aktif per ketua kelas
    expect(migration1Sql).toMatch(/CREATE UNIQUE INDEX idx_loans_active_student[\s\S]*?WHERE status = 'ACTIVE'/);

    // 4. Satu calon ketua awal (INITIAL) per kelas
    expect(migration1Sql).toMatch(/CREATE UNIQUE INDEX idx_claims_one_pending_initial[\s\S]*?WHERE claim_type = 'INITIAL' AND status = 'PENDING'/);
  });

  it('E-3: Migration 1 memuat kolom penyelarasan PRD (current_class_id & issue_resolved_at)', () => {
    expect(migration1Sql).toContain('current_class_id uuid NULL REFERENCES public.classes(id)');
    expect(migration1Sql).toContain('issue_resolved_at timestamptz NULL');
    expect(migration1Sql).toContain('qr_token_version integer NOT NULL DEFAULT 1');
  });

  it('E-4: Migration 2 mengaktifkan RLS pada 100% tabel tanpa pengecualian', () => {
    const requiredTables = [
      'staff_profiles',
      'classes',
      'students',
      'class_leader_claims',
      'projectors',
      'projector_status_logs',
      'loans',
      'audit_logs',
      'kiosk_sessions',
      'app_settings',
    ];

    for (const table of requiredTables) {
      expect(migration2Sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('E-5: Migration 2 menerapkan SECURITY DEFINER dengan search_path eksplisit = public pada helper RLS', () => {
    expect(migration2Sql).toContain('CREATE OR REPLACE FUNCTION public.is_active_staff()');
    expect(migration2Sql).toContain('CREATE OR REPLACE FUNCTION public.is_active_admin()');
    expect(migration2Sql).toContain('SECURITY DEFINER');
    expect(migration2Sql).toContain('SET search_path = public');
  });

  it('E-6: Migration 3 mengonfigurasi bucket privat smartprojex-media dengan public = false', () => {
    expect(migration3Sql).toContain("'smartprojex-media'");
    expect(migration3Sql).toMatch(/public,\s*file_size_limit[\s\S]*?false/);
    expect(migration3Sql).toContain('image/jpeg');
    expect(migration3Sql).toContain('image/png');
    expect(migration3Sql).toContain('image/webp');
  });

  it('E-7: Migration 4 mendefinisikan process_loan_transaction dengan row locking dan idempotensi', () => {
    expect(migration4Sql).toContain('CREATE OR REPLACE FUNCTION public.process_loan_transaction');
    expect(migration4Sql).toContain('p_idempotency_key varchar(64)');
    expect(migration4Sql).toContain('FOR UPDATE'); // Row-level locking
    expect(migration4Sql).toContain('SECURITY DEFINER');
    expect(migration4Sql).toContain('SET search_path = public');
    expect(migration4Sql).toContain('CANCELLED_ISSUE');
    expect(migration4Sql).toContain('BORROWED');
    expect(migration4Sql).toContain('AVAILABLE');
    expect(migration4Sql).toContain('MAINTENANCE');
  });

  it('E-8: Seed data memuat konfigurasi default app_settings tanpa data pengguna dummy', () => {
    expect(seedSql).toContain("'operational_hours'");
    expect(seedSql).toContain("'academic_term'");
    expect(seedSql).toContain("'storage_monitoring'");
    expect(seedSql).not.toContain('INSERT INTO public.students'); // Tanpa dummy user
    expect(seedSql).not.toContain('INSERT INTO public.loans'); // Tanpa dummy loans
  });

  it('E-9: Migration 5 mendefinisikan transfer_class_leader dan revoke_student_qr_pass secara atomik', () => {
    expect(migration5Sql).toContain('CREATE OR REPLACE FUNCTION public.transfer_class_leader');
    expect(migration5Sql).toContain('CREATE OR REPLACE FUNCTION public.revoke_student_qr_pass');
    expect(migration5Sql).toContain('FOR UPDATE'); // Row-level locking on classes
    expect(migration5Sql).toContain('SECURITY DEFINER');
    expect(migration5Sql).toContain('SET search_path = public, pg_temp');
    expect(migration5Sql).toContain('LEADER_TRANSFERRED');
    expect(migration5Sql).toContain('QR_REVOKED');
    expect(migration5Sql).toContain('qr_token_version + 1');
  });
});

