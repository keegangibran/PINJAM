-- ==============================================================================
-- SmartProjex — Migration 6: Security Hardening & Concurrency Controls
-- Phase 8 Technical Audit Remediation:
--   1. Revoke public/unauthorized execute permissions on critical SECURITY DEFINER functions.
--   2. Grant execute strictly to service_role (invoked via Next.js server Route Handlers).
--   3. Explicitly enforce search_path on trigger and helper functions.
--   4. Implement atomic database-level concurrency locking for cron & retention jobs.
--   5. Add RLS policy for anonymous reading of active classes for student registration.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Cabut Izin Eksekusi Fungsi Transaksional dari PUBLIC, anon, dan authenticated
-- ------------------------------------------------------------------------------

-- Cabut izin publik dari process_loan_transaction
REVOKE EXECUTE ON FUNCTION public.process_loan_transaction(
  varchar(64), varchar(30), text, varchar(20), uuid, uuid, text, varchar(15), varchar(100), timestamptz
) FROM PUBLIC, anon, authenticated;

-- Berikan izin khusus kepada service_role
GRANT EXECUTE ON FUNCTION public.process_loan_transaction(
  varchar(64), varchar(30), text, varchar(20), uuid, uuid, text, varchar(15), varchar(100), timestamptz
) TO service_role;

-- Cabut izin publik dan authenticated dari transfer_class_leader (hanya server Route Handler yang memvalidasi otorisasi)
REVOKE EXECUTE ON FUNCTION public.transfer_class_leader(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_class_leader(uuid, uuid, text) TO service_role;

-- Cabut izin publik dan authenticated dari revoke_student_qr_pass
REVOKE EXECUTE ON FUNCTION public.revoke_student_qr_pass(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_student_qr_pass(uuid) TO service_role;

-- ------------------------------------------------------------------------------
-- 2. Penguatan search_path pada Trigger & Helper Functions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Kebijakan RLS: Akses Anonim Terbaca untuk Kelas Aktif (Registrasi Mahasiswa)
-- ------------------------------------------------------------------------------
-- Memungkinkan calon mahasiswa yang belum memiliki sesi membaca data kelas aktif pada form registrasi
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'classes' AND policyname = 'anon_read_active_classes'
  ) THEN
    CREATE POLICY "anon_read_active_classes" ON public.classes
    FOR SELECT TO anon
    USING (is_active = true);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Fungsi Atomik: Concurrency Lock untuk Scheduled Maintenance / Retention
-- ------------------------------------------------------------------------------
-- Memperoleh lock eksekusi eksklusif untuk mencegah eksekusi ganda simultan dari Vercel Cron
CREATE OR REPLACE FUNCTION public.acquire_retention_lock(
  p_lock_ttl_seconds integer DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_current_val jsonb;
  v_last_run timestamptz;
  v_status text;
BEGIN
  -- Kunci baris app_settings untuk key 'retention_last_run'
  SELECT value INTO v_current_val
  FROM public.app_settings
  WHERE key = 'retention_last_run'
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Inisialisasi baris jika belum ada
    INSERT INTO public.app_settings (key, value, description, updated_at)
    VALUES (
      'retention_last_run',
      jsonb_build_object('status', 'RUNNING', 'last_run_at', v_now),
      'Status proses retensi pemeliharaan sistem.',
      v_now
    );
    RETURN true;
  END IF;

  v_status := v_current_val->>'status';
  v_last_run := (v_current_val->>'last_run_at')::timestamptz;

  -- Jika status RUNNING dan belum expired (TTL misal 5 menit) -> tolak perolehan lock
  IF v_status = 'RUNNING' AND v_last_run IS NOT NULL AND (v_now - v_last_run) < (p_lock_ttl_seconds || ' seconds')::interval THEN
    RETURN false;
  END IF;

  -- Perbarui status menjadi RUNNING
  UPDATE public.app_settings
  SET
    value = jsonb_build_object(
      'status', 'RUNNING',
      'last_run_at', v_now,
      'previous_status', v_status
    ),
    updated_at = v_now
  WHERE key = 'retention_last_run';

  RETURN true;
END;
$$;

-- Melepaskan lock atau memperbarui status hasil pemeliharaan
CREATE OR REPLACE FUNCTION public.release_retention_lock(
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.app_settings
  SET
    value = p_result,
    updated_at = now()
  WHERE key = 'retention_last_run';
END;
$$;

-- Amankan fungsi locking dari akses publik
REVOKE EXECUTE ON FUNCTION public.acquire_retention_lock(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_retention_lock(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_retention_lock(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_retention_lock(jsonb) TO service_role;

