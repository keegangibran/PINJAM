-- ==============================================================================
-- SmartProjex — Migration 1: Initial Database Schema
-- Definisi tabel domain, tipe data, CHECK constraint, dan Partial Unique Indexes.
-- Sesuai PRD Revisi 3 Bagian 7.2 dan Invariants AGENTS.md.
-- ==============================================================================

-- 1. Ekstensi UUID dan helper fungsi updated_at
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 2. Tabel staff_profiles
-- Akun individual petugas TU (STAFF) dan Admin (ADMIN).
-- ------------------------------------------------------------------------------
CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  role varchar(10) NOT NULL CHECK (role IN ('STAFF', 'ADMIN')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trigger_staff_profiles_updated_at
BEFORE UPDATE ON public.staff_profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 3. Tabel classes
-- Daftar kelas baku (prodi + angkatan + rombel + semester).
-- ------------------------------------------------------------------------------
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_program varchar(100) NOT NULL,
  cohort_year smallint NOT NULL CHECK (cohort_year >= 2000 AND cohort_year <= 2100),
  section varchar(10) NOT NULL,
  academic_term varchar(20) NOT NULL, -- Contoh: '2026/2027-GANJIL'
  leader_student_id uuid NULL, -- FK ke students(id), ditambahkan via ALTER TABLE
  leader_since timestamptz NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_classes_program_cohort_section_term UNIQUE (study_program, cohort_year, section, academic_term)
);

CREATE TRIGGER trigger_classes_updated_at
BEFORE UPDATE ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 4. Tabel students
-- Mahasiswa / calon ketua kelas / ketua kelas aktif.
-- Termasuk penambahan current_class_id sesuai persetujuan GAP-01.
-- ------------------------------------------------------------------------------
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nim varchar(20) NOT NULL,
  name varchar(100) NOT NULL,
  email varchar(100) NOT NULL,
  current_class_id uuid NULL REFERENCES public.classes(id) ON DELETE SET NULL,
  registration_status varchar(30) NOT NULL DEFAULT 'UNVERIFIED_EMAIL' CHECK (
    registration_status IN (
      'UNVERIFIED_EMAIL',
      'PENDING_DOCUMENT',
      'PENDING_REVIEW',
      'ACTIVE',
      'REJECTED',
      'RESUBMISSION_REQUIRED',
      'INACTIVE'
    )
  ),
  profile_photo_path text NULL,
  verification_document_path text NULL,
  verification_document_type varchar(10) NULL CHECK (
    verification_document_type IS NULL OR verification_document_type IN ('KTM', 'KTP')
  ),
  verification_checks jsonb NULL, -- {face_match: boolean, name_match: boolean, status_confirmed: boolean}
  verification_notes text NULL,
  verified_by uuid NULL REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  verified_at timestamptz NULL,
  qr_token_version integer NOT NULL DEFAULT 1 CHECK (qr_token_version >= 1),
  deactivated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trigger_students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Menghubungkan FK classes.leader_student_id ke students.id
ALTER TABLE public.classes
ADD CONSTRAINT fk_classes_leader_student
FOREIGN KEY (leader_student_id) REFERENCES public.students(id) ON DELETE SET NULL;

-- Partial Unique Index: Hanya 1 akun berstatus ACTIVE untuk setiap NIM
CREATE UNIQUE INDEX idx_students_active_nim
ON public.students (nim)
WHERE registration_status = 'ACTIVE';

CREATE INDEX idx_students_auth_user_id ON public.students (auth_user_id);
CREATE INDEX idx_students_current_class_id ON public.students (current_class_id);

-- ------------------------------------------------------------------------------
-- 5. Tabel class_leader_claims
-- Antrean klaim ketua kelas (INITIAL, REPLACEMENT, TRANSFER).
-- ------------------------------------------------------------------------------
CREATE TABLE public.class_leader_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  claim_type varchar(15) NOT NULL CHECK (claim_type IN ('INITIAL', 'REPLACEMENT', 'TRANSFER')),
  status varchar(15) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  decided_by uuid NULL REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  decided_at timestamptz NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trigger_class_leader_claims_updated_at
BEFORE UPDATE ON public.class_leader_claims
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Partial Unique Index: Maksimal 1 calon ketua awal (INITIAL) berstatus PENDING per kelas
CREATE UNIQUE INDEX idx_claims_one_pending_initial
ON public.class_leader_claims (class_id)
WHERE claim_type = 'INITIAL' AND status = 'PENDING';

CREATE INDEX idx_claims_student_id ON public.class_leader_claims (student_id);
CREATE INDEX idx_claims_status ON public.class_leader_claims (status);

-- ------------------------------------------------------------------------------
-- 6. Tabel projectors
-- Inventaris unit proyektor fisik.
-- ------------------------------------------------------------------------------
CREATE TABLE public.projectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) UNIQUE NOT NULL,
  name varchar(100) NOT NULL,
  status varchar(15) NOT NULL DEFAULT 'AVAILABLE' CHECK (
    status IN ('AVAILABLE', 'BORROWED', 'MAINTENANCE', 'INACTIVE')
  ),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trigger_projectors_updated_at
BEFORE UPDATE ON public.projectors
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_projectors_status ON public.projectors (status);

-- ------------------------------------------------------------------------------
-- 7. Tabel loans
-- Transaksi peminjaman dan pengembalian unit proyektor.
-- ------------------------------------------------------------------------------
CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key varchar(64) UNIQUE NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  projector_id uuid NOT NULL REFERENCES public.projectors(id) ON DELETE RESTRICT,
  borrowed_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  borrow_photo_path text NULL,
  borrow_identification_method varchar(15) NOT NULL DEFAULT 'QR' CHECK (
    borrow_identification_method IN ('QR', 'MANUAL_LOOKUP')
  ),
  borrow_processed_by uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE RESTRICT,
  returned_at timestamptz NULL,
  return_photo_path text NULL,
  returned_by_type varchar(15) NULL CHECK (
    returned_by_type IS NULL OR returned_by_type IN ('BORROWER', 'REPRESENTATIVE')
  ),
  returned_by_name varchar(100) NULL,
  return_processed_by uuid NULL REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  return_condition varchar(20) NULL CHECK (
    return_condition IS NULL OR return_condition IN ('NORMAL', 'REPORTED_ISSUE')
  ),
  damage_notes text NULL,
  issue_resolved_at timestamptz NULL, -- Menandai penyelesaian kendala untuk acuan retensi 180 hari
  status varchar(15) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED')),
  photos_deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trigger_loans_updated_at
BEFORE UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Partial Unique Index 1: Maksimal 1 transaksi peminjaman aktif per unit proyektor
CREATE UNIQUE INDEX idx_loans_active_projector
ON public.loans (projector_id)
WHERE status = 'ACTIVE';

-- Partial Unique Index 2: Maksimal 1 transaksi peminjaman aktif per mahasiswa (ketua kelas)
CREATE UNIQUE INDEX idx_loans_active_student
ON public.loans (student_id)
WHERE status = 'ACTIVE';

-- Indeks performa untuk kueri keterlambatan real-time
CREATE INDEX idx_loans_active_due_at
ON public.loans (due_at)
WHERE status = 'ACTIVE';

CREATE INDEX idx_loans_class_id ON public.loans (class_id);
CREATE INDEX idx_loans_borrow_processed_by ON public.loans (borrow_processed_by);

-- ------------------------------------------------------------------------------
-- 8. Tabel projector_status_logs
-- Riwayat kronologis setiap perubahan status unit proyektor.
-- ------------------------------------------------------------------------------
CREATE TABLE public.projector_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projector_id uuid NOT NULL REFERENCES public.projectors(id) ON DELETE CASCADE,
  from_status varchar(15) NOT NULL CHECK (from_status IN ('AVAILABLE', 'BORROWED', 'MAINTENANCE', 'INACTIVE')),
  to_status varchar(15) NOT NULL CHECK (to_status IN ('AVAILABLE', 'BORROWED', 'MAINTENANCE', 'INACTIVE')),
  reason text NULL,
  photo_path text NULL,
  loan_id uuid NULL REFERENCES public.loans(id) ON DELETE SET NULL,
  idempotency_key varchar(64) NULL, -- Untuk kasus pembatalan pinjam karena kendala
  changed_by uuid NULL REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projector_status_logs_projector_id ON public.projector_status_logs (projector_id);
CREATE INDEX idx_projector_status_logs_created_at ON public.projector_status_logs (created_at);

-- ------------------------------------------------------------------------------
-- 9. Tabel audit_logs
-- Jejak audit keamanan, privasi, dan operasi sistem yang append-only.
-- ------------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id uuid NULL REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  actor_student_id uuid NULL REFERENCES public.students(id) ON DELETE SET NULL,
  action varchar(50) NOT NULL,
  entity_type varchar(50) NOT NULL,
  entity_id varchar(64) NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at);
CREATE INDEX idx_audit_logs_actor_staff ON public.audit_logs (actor_staff_id);

-- ------------------------------------------------------------------------------
-- 10. Tabel kiosk_sessions
-- Sesi Kiosk berumur maksimal 120 detik untuk isolasi state transaksi di serverless.
-- ------------------------------------------------------------------------------
CREATE TABLE public.kiosk_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  identification_method varchar(15) NOT NULL CHECK (identification_method IN ('QR', 'MANUAL_LOOKUP')),
  manual_reason text NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kiosk_sessions_expires_consumed ON public.kiosk_sessions (expires_at, consumed_at);

-- ------------------------------------------------------------------------------
-- 11. Tabel app_settings
-- Konfigurasi kunci-nilai operasional sistem (jam operasional TU, semester aktif, kuota storage).
-- ------------------------------------------------------------------------------
CREATE TABLE public.app_settings (
  key varchar(50) PRIMARY KEY,
  value jsonb NOT NULL,
  description text NULL,
  updated_by uuid NULL REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trigger_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
