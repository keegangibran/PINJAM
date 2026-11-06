-- ==============================================================================
-- SmartProjex Migration: Class Leader Transfer & QR Revocation
-- Migration ID: 20261106000005_class_leader_transfer.sql
-- Invariants:
--   - FR-01E: Alur transfer jabatan ketua kelas 1-langkah langsung & atomik
--   - FR-02 & NFR-03: Kenaikan qr_token_version untuk mencabut QR Pass secara instan
--   - RLS & least-privilege security via SECURITY DEFINER dan search_path terisolasi
-- ==============================================================================

-- 1. Fungsi Atomik: transfer_class_leader
CREATE OR REPLACE FUNCTION public.transfer_class_leader(
  p_caller_student_id uuid,
  p_target_student_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller public.students%ROWTYPE;
  v_target public.students%ROWTYPE;
  v_class public.classes%ROWTYPE;
  v_new_version integer;
  v_claim_id uuid;
BEGIN
  -- 1. Validasi pemohon (caller)
  SELECT * INTO v_caller
  FROM public.students
  WHERE id = p_caller_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND: Mahasiswa pemohon tidak ditemukan.';
  END IF;

  IF v_caller.registration_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'CALLER_NOT_ACTIVE: Akun mahasiswa pemohon belum aktif.';
  END IF;

  IF v_caller.current_class_id IS NULL THEN
    RAISE EXCEPTION 'NO_CLASS_ASSIGNED: Mahasiswa pemohon belum terdaftar dalam kelas.';
  END IF;

  -- 2. Kunci dan validasi baris kelas (FOR UPDATE untuk mencegah race condition)
  SELECT * INTO v_class
  FROM public.classes
  WHERE id = v_caller.current_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLASS_NOT_FOUND: Kelas pemohon tidak ditemukan.';
  END IF;

  IF NOT v_class.is_active THEN
    RAISE EXCEPTION 'CLASS_INACTIVE: Kelas pemohon berstatus nonaktif.';
  END IF;

  IF v_class.leader_student_id IS DISTINCT FROM v_caller.id THEN
    RAISE EXCEPTION 'NOT_CLASS_LEADER: Pemohon bukan ketua kelas aktif dari kelas ini.';
  END IF;

  -- 3. Validasi mahasiswa target
  IF p_target_student_id = p_caller_student_id THEN
    RAISE EXCEPTION 'CANNOT_TRANSFER_TO_SELF: Tidak dapat mengalihkan jabatan ketua kepada diri sendiri.';
  END IF;

  SELECT * INTO v_target
  FROM public.students
  WHERE id = p_target_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND: Mahasiswa penerima tidak ditemukan.';
  END IF;

  IF v_target.registration_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'TARGET_NOT_ACTIVE: Mahasiswa penerima berstatus tidak aktif (%s). Hanya mahasiswa ACTIVE yang dapat menjadi ketua.', v_target.registration_status;
  END IF;

  IF v_target.current_class_id IS DISTINCT FROM v_class.id THEN
    RAISE EXCEPTION 'TARGET_NOT_IN_SAME_CLASS: Mahasiswa penerima tidak berada pada kelas yang sama dengan pemohon.';
  END IF;

  -- 4. Pindahkan jabatan ketua kelas pada tabel classes
  UPDATE public.classes
  SET
    leader_student_id = v_target.id,
    leader_since = now(),
    updated_at = now()
  WHERE id = v_class.id;

  -- 5. Naikkan qr_token_version ketua lama agar QR lamanya seketika invalid (FR-01E, FR-02)
  UPDATE public.students
  SET
    qr_token_version = qr_token_version + 1,
    updated_at = now()
  WHERE id = v_caller.id
  RETURNING qr_token_version INTO v_new_version;

  -- 6. Catat riwayat serah terima pada class_leader_claims (status APPROVED, decided_by NULL sesuai PRD)
  INSERT INTO public.class_leader_claims (
    class_id,
    student_id,
    claim_type,
    status,
    decided_by,
    decided_at,
    notes,
    created_at,
    updated_at
  ) VALUES (
    v_class.id,
    v_target.id,
    'TRANSFER',
    'APPROVED',
    NULL,
    now(),
    p_reason,
    now(),
    now()
  )
  RETURNING id INTO v_claim_id;

  -- 7. Catat audit log LEADER_TRANSFERRED (FR-19)
  INSERT INTO public.audit_logs (
    action,
    entity_type,
    entity_id,
    actor_student_id,
    metadata,
    created_at
  ) VALUES (
    'LEADER_TRANSFERRED',
    'classes',
    v_class.id,
    v_caller.id,
    jsonb_build_object(
      'previous_leader_student_id', v_caller.id,
      'new_leader_student_id', v_target.id,
      'class_id', v_class.id,
      'claim_id', v_claim_id,
      'reason', p_reason
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'class_id', v_class.id,
    'claim_id', v_claim_id,
    'previous_leader_id', v_caller.id,
    'new_leader_id', v_target.id,
    'caller_new_token_version', v_new_version
  );
END;
$$;

-- 2. Fungsi Atomik: revoke_student_qr_pass
CREATE OR REPLACE FUNCTION public.revoke_student_qr_pass(
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_new_version integer;
BEGIN
  -- Validasi mahasiswa
  SELECT * INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND: Mahasiswa tidak ditemukan.';
  END IF;

  IF v_student.registration_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_ACTIVE: Hanya akun berstatus ACTIVE yang dapat mencabut QR Pass.';
  END IF;

  -- Naikkan qr_token_version secara atomik
  UPDATE public.students
  SET
    qr_token_version = qr_token_version + 1,
    updated_at = now()
  WHERE id = p_student_id
  RETURNING qr_token_version INTO v_new_version;

  -- Catat audit log QR_REVOKED
  INSERT INTO public.audit_logs (
    action,
    entity_type,
    entity_id,
    actor_student_id,
    metadata,
    created_at
  ) VALUES (
    'QR_REVOKED',
    'students',
    p_student_id,
    p_student_id,
    jsonb_build_object(
      'previous_version', v_student.qr_token_version,
      'new_version', v_new_version
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'student_id', p_student_id,
    'new_version', v_new_version
  );
END;
$$;

-- 3. Hak Akses Eksekusi
GRANT EXECUTE ON FUNCTION public.transfer_class_leader(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_student_qr_pass(uuid) TO authenticated, service_role;
